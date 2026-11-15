"""
STEP 8a - THE WEATHER NETWORK: a small neural network that reads the recent weather at a place
and gives the chances for tomorrow's weather. This file is a toolbox used by
train_weather_model.py; it does not run on its own.

WHAT THE NETWORK SEES FOR EACH DAY
  Today's weather : six values, each as "how far from normal for this place and time of year":
                    daily high, day-night range, dryness of the air, cloud, wind, soil moisture.
                    Rain goes in as an amount and a wet-or-dry flag.
  Memory          : days since it last rained, rain over the last 7 and 30 days, and how warm
                    the last 30 days have been.
  Tomorrow's date : a clock for the time of year (see CLOCK below), plus the normal high and
                    the normal chance of rain for that date.
  The place       : latitude, usual day-night range, usual high, yearly rain, and a short
                    code per place that the network works out for itself.

WHAT IT GIVES BACK
  Rain            : the chance of each of nine size bands (none, a trace, ... 40 mm or more).
  The other six   : a range of likely values, built from three bell curves so it can be
                    lopsided. Each value is predicted knowing the ones before it, so a wet day
                    comes out cloudy and cool, as real wet days do.

CLOCK
  The day of the year is given as a point on a circle (a sine and a cosine), so 31 December
  sits next to 1 January. A second pair goes round twice a year, which lets the network
  learn seasons that are not evenly shaped.
"""
import math

import torch
from torch import nn

# The order of the six values the network predicts as bell curves (rain is handled apart).
CHANNELS = ["tmax", "range", "dew_gap", "cloud", "wind", "soil"]
# Rain bands in mm. 1, 5 and 10 mm are band edges because the labels and measures use them.
RAIN_EDGES = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 40.0]
N_RAIN = len(RAIN_EDGES) + 1
N_STATE = len(CHANNELS) + 6     # the six values, rain amount, wet flag and four memory values
N_DATE = 6                      # four clock values, normal chance of rain, normal high
N_PLACE_FACTS = 4
N_CURVES = 3                    # bell curves per value
LIMIT = 5.0                     # no value is allowed further than this from normal (in spreads)


class WeatherGRU(nn.Module):
    """The network: a memory part (GRU) that reads the days, and one small head per value."""

    def __init__(self, n_places, hidden=128, code_size=8):
        super().__init__()
        self.place_code = nn.Embedding(n_places, code_size)
        context = N_DATE + N_PLACE_FACTS + code_size
        self.memory = nn.GRU(N_STATE + context, hidden, batch_first=True)
        self.drop = nn.Dropout(0.1)
        # The rain head sees the memory and the context. Each later head also sees the rain
        # band and the values already decided for the same day.
        self.rain_head = self._head(hidden + context, N_RAIN)
        self.value_heads = nn.ModuleList(
            self._head(hidden + context + N_RAIN + k, 3 * N_CURVES) for k in range(len(CHANNELS)))

    @staticmethod
    def _head(n_in, n_out):
        return nn.Sequential(nn.Linear(n_in, 96), nn.SiLU(), nn.Linear(96, n_out))

    def _context(self, date_info, place_facts, place):
        return torch.cat([date_info, place_facts, self.place_code(place)], dim=-1)

    def _curves(self, k, features, today_value):
        """Returns the weights, centres and widths of the bell curves for value number k."""
        weight, shift, width = self.value_heads[k](features).chunk(3, dim=-1)
        # The centres are given as a change from today's value, so "same as today" is the
        # starting guess and the network only has to learn the change.
        return torch.log_softmax(weight, -1), today_value.unsqueeze(-1) + shift, width.clamp(-6.0, 1.5)

    def loss(self, state, date_info, place_facts, place, rain_band, values):
        """
        Scores the network on real days: how surprised it was by what happened next.
        state is each day's weather, date_info describes the day after, and rain_band and
        values are what that next day really was. Returns one score per day (lower is better).
        """
        context = self._context(date_info, place_facts, place)
        remembered, _ = self.memory(torch.cat([state, context], dim=-1))
        base = torch.cat([self.drop(remembered), context], dim=-1)

        score = nn.functional.cross_entropy(self.rain_head(base).flatten(0, 1), rain_band.flatten(),
                                            reduction="none").view(rain_band.shape)
        base = torch.cat([base, nn.functional.one_hot(rain_band, N_RAIN).float()], dim=-1)
        for k in range(len(CHANNELS)):
            # The real values of the earlier channels are handed over, as they will be known
            # by the time this one is drawn in a simulation.
            log_weight, centre, log_width = self._curves(k, torch.cat([base, values[..., :k]], -1), state[..., k])
            gap = (values[..., k:k + 1] - centre) / log_width.exp()
            log_chance = log_weight - 0.5 * gap ** 2 - log_width - 0.5 * math.log(2 * math.pi)
            score = score - torch.logsumexp(log_chance, dim=-1)
        return score

    @torch.no_grad()
    def read(self, state, date_info, place_facts, place):
        """Reads a run of real days and returns the memory at the end, ready to simulate from."""
        context = self._context(date_info, place_facts, place)
        _, memory = self.memory(torch.cat([state, context], dim=-1))
        return memory

    @torch.no_grad()
    def draw_next_day(self, state, date_info, place_facts, place, memory):
        """Draws one possible next day. Returns its rain band, its six values and the new memory."""
        context = self._context(date_info, place_facts, place)
        remembered, memory = self.memory(torch.cat([state, context], dim=-1).unsqueeze(1), memory)
        base = torch.cat([remembered[:, 0], context], dim=-1)

        rain_band = torch.multinomial(torch.softmax(self.rain_head(base), -1), 1)[:, 0]
        base = torch.cat([base, nn.functional.one_hot(rain_band, N_RAIN).float()], dim=-1)
        values = torch.zeros(len(state), 0)
        for k in range(len(CHANNELS)):
            log_weight, centre, log_width = self._curves(k, torch.cat([base, values], -1), state[:, k])
            # One of the bell curves is picked by its weight, then a value is drawn from it.
            pick = torch.multinomial(log_weight.exp(), 1)
            value = centre.gather(1, pick) + log_width.gather(1, pick).exp() * torch.randn(len(state), 1)
            values = torch.cat([values, value.clamp(-LIMIT, LIMIT)], dim=1)
        return rain_band, values, memory
