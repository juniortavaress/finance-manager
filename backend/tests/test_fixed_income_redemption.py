import datetime as dt
import unittest
from decimal import Decimal

from app.services.fixed_income_service import (
    FixedIncomeEvent,
    make_value_fn,
    pos_fixado_current_value,
    position_snapshot,
    redemption_quantity,
    replay_events,
)

D = Decimal


def linear_value_fn(invested, rate_pct, start, end):
    """Rendimento simples de 10% ao ano por dia corrido, so' para facilitar a
    conferencia manual dos numeros."""
    days = max((end - start).days, 0)
    return (invested * (1 + D("0.10") * D(days) / D(365))).quantize(D("0.01"))


def buy(key, date, amount, rate=None):
    return FixedIncomeEvent(key, "buy", date, D(str(amount)), rate)


def sell(key, date, amount):
    return FixedIncomeEvent(key, "sell", date, D(str(amount)), None)


class RedemptionMathTest(unittest.TestCase):
    def test_partial_redemption_is_proportional_across_lots(self):
        # lote A: 1000 em 01/01, lote B: 1000 em 01/07; resgate em 31/12.
        events = [
            buy("a", dt.date(2026, 1, 1), 1000),
            buy("b", dt.date(2026, 7, 1), 1000),
            sell("s", dt.date(2026, 12, 31), 1000),
        ]
        lots, results = replay_events(events, linear_value_fn)
        (result,) = results

        value_a = linear_value_fn(D(1000), None, dt.date(2026, 1, 1), dt.date(2026, 12, 31))  # 1100.00 (364 dias)
        value_b = linear_value_fn(D(1000), None, dt.date(2026, 7, 1), dt.date(2026, 12, 31))
        self.assertEqual(result.value_before, value_a + value_b)
        self.assertEqual(result.ratio, D(1000) / (value_a + value_b))
        # principal e rendimento saem na mesma proporcao
        self.assertEqual(result.principal_out, D(2000) * result.ratio)
        self.assertEqual(result.yield_out, D(1000) - result.principal_out)
        self.assertFalse(result.full)
        self.assertFalse(result.exceeds)
        # cada lote ficou com (1 - ratio)
        self.assertEqual([lot.factor for lot in lots], [1 - result.ratio] * 2)

    def test_remaining_position_keeps_growing_proportionally(self):
        buys = [buy("a", dt.date(2026, 1, 1), 1000), buy("b", dt.date(2026, 3, 1), 500)]
        redeem_date = dt.date(2026, 6, 1)
        later = dt.date(2026, 12, 1)

        lots_without, _ = replay_events(buys, linear_value_fn)
        value_without_later, _ = position_snapshot(lots_without, later, linear_value_fn)

        lots_with, results = replay_events(buys + [sell("s", redeem_date, 600)], linear_value_fn)
        value_with_later, _ = position_snapshot(lots_with, later, linear_value_fn)

        ratio = results[0].ratio
        self.assertAlmostEqual(float(value_with_later), float(value_without_later * (1 - ratio)), places=1)

    def test_full_redemption_when_amount_reaches_position_value(self):
        events = [buy("a", dt.date(2026, 1, 1), 1000), sell("s", dt.date(2026, 7, 1), 1000)]
        lots, results = replay_events(events, linear_value_fn)
        value = results[0].value_before

        events_all = [buy("a", dt.date(2026, 1, 1), 1000), sell("s", dt.date(2026, 7, 1), value)]
        lots, (result,) = replay_events(events_all, linear_value_fn)
        self.assertTrue(result.full)
        self.assertEqual(result.ratio, 1)
        self.assertEqual(lots[0].factor, 0)
        self.assertEqual(redemption_quantity(D("3"), result), D("3"))

    def test_dust_left_behind_counts_as_full_redemption(self):
        events = [buy("a", dt.date(2026, 1, 1), 1000), sell("s", dt.date(2026, 7, 1), 1)]
        _, (probe,) = replay_events(events, linear_value_fn)
        events[1] = sell("s", dt.date(2026, 7, 1), probe.value_before - D("0.50"))
        _, (result,) = replay_events(events, linear_value_fn)
        self.assertTrue(result.full)

    def test_amount_slightly_above_estimate_is_full_but_far_above_is_error(self):
        base = [buy("a", dt.date(2026, 1, 1), 1000)]
        _, (probe,) = replay_events(base + [sell("s", dt.date(2026, 7, 1), 1)], linear_value_fn)
        value = probe.value_before

        _, (slightly,) = replay_events(base + [sell("s", dt.date(2026, 7, 1), value * D("1.01"))], linear_value_fn)
        self.assertTrue(slightly.full)
        self.assertFalse(slightly.exceeds)
        # lucro realizado usa o valor que o usuario informou
        self.assertEqual(slightly.yield_out, value * D("1.01") - D(1000))

        _, (far,) = replay_events(base + [sell("s", dt.date(2026, 7, 1), value * D("1.10"))], linear_value_fn)
        self.assertTrue(far.exceeds)

    def test_flagged_full_redemption_below_estimate_closes_the_position(self):
        base = [buy("a", dt.date(2026, 1, 1), 500)]
        _, (probe,) = replay_events(base + [sell("s", dt.date(2026, 7, 1), 1)], linear_value_fn)
        value = probe.value_before
        paid = value - D("20")  # banco pagou menos que a estimativa (ex: liquido de IR)

        lots, (partial,) = replay_events(base + [sell("s", dt.date(2026, 7, 1), paid)], linear_value_fn)
        self.assertFalse(partial.full)
        self.assertGreater(lots[0].factor, 0)

        lots, (closed,) = replay_events(
            base + [FixedIncomeEvent("s", "sell", dt.date(2026, 7, 1), paid, None, True)], linear_value_fn
        )
        self.assertTrue(closed.full)
        self.assertEqual(lots[0].factor, 0)
        self.assertEqual(closed.principal_out, D(500))
        self.assertEqual(closed.yield_out, paid - D(500))

    def test_redeeming_from_empty_position_is_an_error(self):
        _, (result,) = replay_events([sell("s", dt.date(2026, 7, 1), 100)], linear_value_fn)
        self.assertTrue(result.exceeds)

    def test_buy_after_full_redemption_starts_a_new_cycle(self):
        events = [
            buy("a", dt.date(2026, 1, 1), 1000),
            sell("s1", dt.date(2026, 1, 1), 1000),  # mesmo dia: resgata tudo
            buy("b", dt.date(2026, 2, 1), 200),
            sell("s2", dt.date(2026, 2, 1), 50),
        ]
        lots, results = replay_events(events, linear_value_fn)
        self.assertTrue(results[0].full)
        self.assertEqual(results[1].value_before, D(200))
        self.assertEqual(results[1].principal_out, D("50"))
        self.assertEqual(results[1].yield_out, D(0))

    def test_as_of_ignores_later_events(self):
        events = [buy("a", dt.date(2026, 1, 1), 1000), sell("s", dt.date(2026, 9, 1), 100)]
        lots, results = replay_events(events, linear_value_fn, as_of=dt.date(2026, 6, 1))
        self.assertEqual(results, [])
        self.assertEqual(lots[0].factor, 1)

    def test_redemption_quantity_is_fraction_of_open_quantity(self):
        events = [buy("a", dt.date(2026, 1, 1), 1000), sell("s", dt.date(2026, 7, 1), 500)]
        _, (result,) = replay_events(events, linear_value_fn)
        quantity = redemption_quantity(D("4"), result)
        self.assertEqual(quantity, (D("4") * result.ratio).quantize(D("0.00000001")))
        self.assertLess(quantity, D("4"))
        self.assertGreater(quantity, 0)


class DerivedQuantityMatchesLegacyEngineTest(unittest.TestCase):
    """O resto do app (posicao, grafico) calcula o valor de um pos-fixado com a
    proporcao `quantidade vendida / quantidade em aberto` - a quantidade
    derivada de um resgate precisa reproduzir exatamente o valor do motor por
    valor."""

    def setUp(self):
        self.rates = {}
        day = dt.date(2026, 5, 10)
        while day <= dt.date(2026, 10, 28):
            if day.weekday() < 5:
                self.rates[day] = D("0.0551")
            day += dt.timedelta(days=1)
        self.value_fn = make_value_fn("pos_fixado", self.rates)

    def legacy_value(self, buys, sells, cutoff):
        """Copia da logica de _pos_fixado_projected_value (investments.py)."""
        quantity = D(0)
        projected = D(0)
        for kind, date, amount, qty in sorted(buys + sells, key=lambda x: (x[1], 0 if x[0] == "buy" else 1)):
            if kind == "buy":
                projected += pos_fixado_current_value(amount, D("120"), self.rates, date, cutoff)
                quantity += qty
            else:
                ratio = qty / quantity
                projected -= projected * ratio
                quantity -= qty
        return projected if quantity > 0 else D(0)

    def test_caixinha_scenario(self):
        amounts = [("2026-05-10", "4494.08"), ("2026-07-20", "500"), ("2026-07-23", "1020.41"), ("2026-08-24", "1000"), ("2026-08-30", "1000")]
        buy_events = [buy(f"b{i}", dt.date.fromisoformat(d), a, D("120")) for i, (d, a) in enumerate(amounts)]
        sell_events = [sell("s1", dt.date(2026, 9, 15), 1500), sell("s2", dt.date(2026, 10, 10), 700)]

        lots, results = replay_events(buy_events + sell_events, self.value_fn)

        # monta as vendas com a quantidade derivada, como a rota faz
        open_quantity = D(0)
        buys = []
        sells = []
        by_key = {r.key: r for r in results}
        ordered = sorted(buy_events + sell_events, key=lambda e: (e.date, 0 if e.kind == "buy" else 1))
        for event in ordered:
            if event.kind == "buy":
                open_quantity += 1
                buys.append(("buy", event.date, event.amount, D(1)))
            else:
                qty = redemption_quantity(open_quantity, by_key[event.key])
                open_quantity -= qty
                sells.append(("sell", event.date, event.amount, qty))

        cutoff = dt.date(2026, 10, 28)
        engine_value, _ = position_snapshot(lots, cutoff, self.value_fn)
        legacy = self.legacy_value(buys, sells, cutoff)
        self.assertAlmostEqual(float(engine_value), float(legacy), delta=0.05)

        # cada resgate: valor bruto = principal que saiu + rendimento que saiu
        for r in results:
            self.assertEqual(r.principal_out + r.yield_out, r.amount)
            self.assertGreater(r.yield_out, 0)


if __name__ == "__main__":
    unittest.main()
