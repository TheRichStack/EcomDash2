export function formatNumber(value: number, locale = "en-US") {
  return new Intl.NumberFormat(locale).format(value)
}

export function formatCurrency(
  value: number,
  currency = "USD",
  locale = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(
  value: number,
  locale = "en-US",
  maximumFractionDigits = 1
) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits,
  }).format(value)
}
