// Financial summary utility — computes the structured financial model
// for a given pay period from all linked accounts.

import type { SupabaseClient } from '@supabase/supabase-js'

export type LineItem = { name: string; amount: number; category?: string | null }

export type FinancialSummary = {
  income: {
    salary:       number
    isBonus:      boolean
    normalSalary: number
    bonusAmount:  number
    rewards:      number
    total:        number
  }
  rent:       { total: number }
  carFinance: { total: number }
  fixedBills: { total: number; items: LineItem[] }
  directDiscretionary: { total: number; fuel: number; other: number; items: LineItem[] }
  creditCardSpending: {
    barclaycard: number
    hsbc:        number
    tesco:       number
    natwestCC:   number
    grandTotal:  number
  }
  realExpenses: { total: number }
  creditCardRepayments: { total: number; items: LineItem[] }
  savingsMovements:     { grossOut: number; grossIn: number; net: number }
  cashFlow:    { totalOut: number; remaining: number }
  netPosition: { surplusDeficit: number; savingsRate: number }
}

type RawTx = {
  description:   string
  merchant_name: string | null
  amount:        number
  tag:           string | null
  category:      string | null
  transfer_flag: boolean
}

function ccSpend(txns: RawTx[]): number {
  return txns
    .filter(t => !t.transfer_flag && t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0)
}

export async function getFinancialSummary(
  supabase: SupabaseClient,
  start:    string,
  end:      string,
): Promise<FinancialSummary> {

  // ── 1. Account IDs ───────────────────────────────────────────────────────────
  const { data: accts } = await supabase.from('accounts').select('id, name')
  const list = accts ?? []
  const first  = (name: string) => list.find(a => a.name === name)?.id as string | undefined
  const allIds = (match: (n: string) => boolean) => list.filter(a => match(a.name)).map(a => a.id as string)

  const nwMainId = first('NatWest Main')
  const barcId   = first('Barclaycard Rewards')
  const hsbcIds  = allIds(n => n.includes('HSBC') && n.includes('Credit'))
  const tescoIds = allIds(n => n.includes('Tesco') && n.includes('Credit'))
  const nwCCId   = first('NatWest Credit Card')

  // ── 2. Fetch transactions ────────────────────────────────────────────────────
  async function fetchTxns(ids: (string | undefined)[]): Promise<RawTx[]> {
    const valid = ids.filter((id): id is string => !!id)
    if (valid.length === 0) return []
    const { data } = await supabase
      .from('transactions')
      .select('description, merchant_name, amount, tag, category, transfer_flag')
      .in('account_id', valid)
      .gte('date', start)
      .lte('date', end)
    return (data ?? []).map(t => ({ ...t, amount: Number(t.amount) }))
  }

  const [nwTxns, bcTxns, hsbcTxns, tescoTxns, nwCCTxns] = await Promise.all([
    fetchTxns([nwMainId]),
    fetchTxns([barcId]),
    fetchTxns(hsbcIds),
    fetchTxns(tescoIds),
    fetchTxns([nwCCId]),
  ])

  // ── 3. Classify NatWest Main ─────────────────────────────────────────────────

  // Income
  const salary  = nwTxns.filter(t => t.tag === 'Income' && t.category === 'Salary')
                        .reduce((s, t) => s + t.amount, 0)
  const rewards = nwTxns.filter(t => t.tag === 'Income' && t.category === 'Rewards')
                        .reduce((s, t) => s + t.amount, 0)

  // Fixed: Rent, Car Finance, Bills
  const rentTotal      = nwTxns
    .filter(t => t.tag === 'Fixed' && t.category === 'Rent')
    .reduce((s, t) => s + Math.abs(t.amount), 0)

  const carFinanceTotal = nwTxns
    .filter(t => t.tag === 'Fixed' && t.category === 'Car Finance')
    .reduce((s, t) => s + Math.abs(t.amount), 0)

  const fixedBillTxns = nwTxns.filter(
    t => t.tag === 'Fixed' && t.category !== 'Rent' && t.category !== 'Car Finance'
  )
  const fixedBillMap = new Map<string, { amount: number; category: string | null }>()
  for (const t of fixedBillTxns) {
    const key  = t.merchant_name || t.description
    const prev = fixedBillMap.get(key) ?? { amount: 0, category: t.category }
    fixedBillMap.set(key, { amount: prev.amount + Math.abs(t.amount), category: t.category })
  }
  const fixedBillItems = Array.from(fixedBillMap.entries())
    .map(([name, v]) => ({ name, amount: v.amount, category: v.category }))
    .sort((a, b) => b.amount - a.amount)
  const fixedBillsTotal = fixedBillItems.reduce((s, i) => s + i.amount, 0)

  // Transfers (NatWest Main, transfer_flag = true)
  const nwTransfersOut = nwTxns.filter(t => t.transfer_flag && t.amount < 0)
  const nwTransfersIn  = nwTxns.filter(t => t.transfer_flag && t.amount > 0)

  // CC repayments: outbound transfers with no category (BARCLAYCARD VISA49, HSBC, etc.)
  const ccRepayTxns = nwTransfersOut.filter(t => !t.category)
  const ccRepayItems: LineItem[] = ccRepayTxns.map(t => ({
    name:   t.merchant_name || t.description,
    amount: Math.abs(t.amount),
  }))
  const ccRepayTotal = ccRepayItems.reduce((s, i) => s + i.amount, 0)

  // Savings out: category = 'Savings Transfer'
  const savingsOut = nwTransfersOut
    .filter(t => t.category === 'Savings Transfer')
    .reduce((s, t) => s + Math.abs(t.amount), 0)

  // Savings in: positive transfers tagged as Savings Transfer
  const savingsIn = nwTransfersIn
    .filter(t => t.category === 'Savings Transfer')
    .reduce((s, t) => s + t.amount, 0)

  // Direct discretionary (NatWest Main, not via CC)
  const discretNW = nwTxns.filter(t => t.tag === 'Discretionary')
  const fuelTotal  = discretNW
    .filter(t => t.category === 'Fuel')
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const otherDiscretTotal = discretNW
    .filter(t => t.category !== 'Fuel')
    .reduce((s, t) => s + Math.abs(t.amount), 0)

  const discretMap = new Map<string, { amount: number; category: string | null }>()
  for (const t of discretNW) {
    const key  = t.merchant_name || t.description
    const prev = discretMap.get(key) ?? { amount: 0, category: t.category }
    discretMap.set(key, { amount: prev.amount + Math.abs(t.amount), category: t.category })
  }
  const discretItems = Array.from(discretMap.entries())
    .map(([name, v]) => ({ name, amount: v.amount, category: v.category }))
    .sort((a, b) => b.amount - a.amount)
  const directDiscretTotal = fuelTotal + otherDiscretTotal

  // ── 4. Credit card spending ──────────────────────────────────────────────────
  const barclaycardSpend = ccSpend(bcTxns)
  const hsbcSpend        = ccSpend(hsbcTxns)
  const tescoSpend       = ccSpend(tescoTxns)
  const nwCCSpend        = ccSpend(nwCCTxns)
  const ccGrandTotal     = barclaycardSpend + hsbcSpend + tescoSpend + nwCCSpend

  // ── 5. Bonus detection ───────────────────────────────────────────────────────
  // Fetch last 5 salary entries (prior to this period) so we have enough
  // data even if one or two were bonus months. Then exclude the single
  // highest value before averaging — this prevents a past bonus from
  // inflating the baseline. Requires at least 2 remaining values.
  let normalSalary = salary
  if (nwMainId) {
    const { data: hist } = await supabase
      .from('transactions')
      .select('amount')
      .eq('account_id', nwMainId)
      .eq('category', 'Salary')
      .lt('date', start)
      .order('date', { ascending: false })
      .limit(5)
    const amounts = (hist ?? []).map(t => Number(t.amount)).sort((a, b) => a - b)
    // Remove the highest value to exclude any bonus months in the history
    const baseline = amounts.length > 1 ? amounts.slice(0, -1) : amounts
    if (baseline.length >= 1) {
      normalSalary = baseline.reduce((a, b) => a + b, 0) / baseline.length
    }
  }
  const isBonus     = salary > normalSalary * 1.10
  const bonusAmount = isBonus ? Math.round(salary - normalSalary) : 0

  // ── 6. Derived totals ────────────────────────────────────────────────────────
  const realExpensesTotal = fixedBillsTotal + rentTotal + carFinanceTotal + directDiscretTotal + ccGrandTotal
  const totalOut          = rentTotal + carFinanceTotal + fixedBillsTotal + directDiscretTotal + ccRepayTotal + savingsOut
  const cashFlowRemaining = salary + rewards - totalOut

  return {
    income: {
      salary,
      isBonus,
      normalSalary: Math.round(normalSalary),
      bonusAmount,
      rewards,
      total: salary + rewards,
    },
    rent:       { total: rentTotal },
    carFinance: { total: carFinanceTotal },
    fixedBills: { total: fixedBillsTotal, items: fixedBillItems },
    directDiscretionary: {
      total: directDiscretTotal,
      fuel:  fuelTotal,
      other: otherDiscretTotal,
      items: discretItems,
    },
    creditCardSpending: {
      barclaycard: barclaycardSpend,
      hsbc:        hsbcSpend,
      tesco:       tescoSpend,
      natwestCC:   nwCCSpend,
      grandTotal:  ccGrandTotal,
    },
    realExpenses: { total: realExpensesTotal },
    creditCardRepayments: { total: ccRepayTotal, items: ccRepayItems },
    savingsMovements: {
      grossOut: savingsOut,
      grossIn:  savingsIn,
      net:      savingsOut - savingsIn,
    },
    cashFlow: {
      totalOut,
      remaining: cashFlowRemaining,
    },
    netPosition: {
      surplusDeficit: salary - realExpensesTotal,
      savingsRate:    salary > 0 ? (savingsOut - savingsIn) / salary : 0,
    },
  }
}
