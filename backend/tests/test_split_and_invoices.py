import datetime as dt
import unittest
from decimal import Decimal
from types import SimpleNamespace

from app.services.finance_service import add_months, refresh_invoice_status
from app.services.fixed_income_service import business_days_between
from app.services.split_service import split_by_percentage, split_equal, validate_value_split

D = Decimal


class SplitTests(unittest.TestCase):
    def test_split_equal_sums_exactly(self):
        shares = split_equal(D("100.00"), ["a", "b", "c"])
        self.assertEqual(sum(shares.values()), D("100.00"))
        self.assertEqual(sorted(shares.values()), [D("33.33"), D("33.33"), D("33.34")])

    def test_split_equal_tiny_amount(self):
        shares = split_equal(D("0.01"), ["a", "b"])
        self.assertEqual(sum(shares.values()), D("0.01"))

    def test_percentage_sums_exactly(self):
        shares = split_by_percentage(D("100.01"), {"a": D("33.33"), "b": D("33.33"), "c": D("33.34")})
        self.assertEqual(sum(shares.values()), D("100.01"))

    def test_percentage_must_sum_100(self):
        with self.assertRaises(ValueError):
            split_by_percentage(D("10"), {"a": D("50"), "b": D("40")})

    def test_value_split_must_match_total(self):
        validate_value_split(D("10.00"), {"a": D("4.00"), "b": D("6.00")})
        with self.assertRaises(ValueError):
            validate_value_split(D("10.00"), {"a": D("4.00"), "b": D("5.99")})


class InvoiceStatusTests(unittest.TestCase):
    def invoice(self, total, paid, status, closing):
        return SimpleNamespace(
            total_amount=D(total), paid_amount=D(paid), status=status, closing_date=closing, paid_at=None
        )

    def test_fully_paid_closed_invoice_becomes_paid(self):
        inv = self.invoice("100", "100", "closed", dt.date(2020, 1, 31))
        refresh_invoice_status(inv)
        self.assertEqual(inv.status, "paid")
        self.assertIsNotNone(inv.paid_at)

    def test_paid_invoice_with_new_purchase_reopens(self):
        inv = self.invoice("150", "100", "paid", dt.date(2999, 1, 31))
        refresh_invoice_status(inv)
        self.assertEqual(inv.status, "open")
        self.assertIsNone(inv.paid_at)

    def test_unpaid_past_closing_is_closed(self):
        inv = self.invoice("50", "0", "open", dt.date(2020, 1, 31))
        refresh_invoice_status(inv)
        self.assertEqual(inv.status, "closed")

    def test_empty_invoice_stays_open(self):
        inv = self.invoice("0", "0", "open", dt.date(2999, 1, 31))
        refresh_invoice_status(inv)
        self.assertEqual(inv.status, "open")


class DateTests(unittest.TestCase):
    def test_add_months_clamps_day(self):
        self.assertEqual(add_months(dt.date(2026, 1, 31), 1), dt.date(2026, 2, 28))
        self.assertEqual(add_months(dt.date(2026, 11, 30), 3), dt.date(2027, 2, 28))

    def test_business_days_excludes_weekends_and_holidays(self):
        # seg 2026-04-27 -> seg 2026-05-04: 5 dias uteis, menos o feriado de 1/mai (sex)
        self.assertEqual(business_days_between(dt.date(2026, 4, 27), dt.date(2026, 5, 4)), 4)


if __name__ == "__main__":
    unittest.main()
