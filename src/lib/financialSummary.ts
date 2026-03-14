// Financial summary — dual-view model
//
// VIEW 1 — SPENDING VIEW: Did I live within my means?
//   Salary − Committed Costs − CC Spending (by tx date) − Direct NatWest Spend = SPENDING SURPLUS
//   Ignores CC repayments (cash flow artefact)
//
// VIEW 2 — CASH FLOW VIEW: What happened to my NatWest balance?
//   Salary − Committed Costs − CC Repayments − Direct Spend − Cash Movements = CASH REMAINING
//   Ignores CC purchases (haven't hit cash yet)
//
// DEBT HEALTH: CC Repayments − CC Spending = net change
//   Positive = paying down debt  ✅
//   Negative = accumulating debt ❌
//
// CACHING:
//   Closed periods (end < today): cached forever (expires_at NULL)
//   Current period: cached 24h
//   Cache key: financial_summary_{start}_{end}  type: financial_summary

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LineItem = { name: string; amount: number; category?: string | null }

export type FinancialSummary = {
  period: { start: string; end: string; label: string }

  income: {
    salary:       number
    isBonus:      boolean
    normalSalary: number
    bonusAmount:  number
    other:        number   // rewards, cashback credits
    total:        number
  }

  committedCosts: {
    rent:          number
    carFinance:    number
    energy:        number
    councilTax:    number
    broadband:     number
    mobile:        number
    insurance:     number
    tvLicence:     number
    carTax:        number
    subscriptions: number
    bankCharges:   number
    total:         number
    items:         LineItem[]   // all fixed except rent + carFinance, grouped by merchant
  }

  spendingView: {
    barclaycard: {
      groceries: number
      dining:    number
      fuel:      number
      medical:   number
      personal:  number
      other:     number
      total:     number
    }
    natwestCC: {
      fuel:  number
      total: number
    }
    hsbc:  { total: number }
    tesco: { total: number }
    directFromNatwest: {
      fuel:      number
      staffShop: number
      other:     number
      total:     number
    }
    totalSpending:          number
    spendingSurplus:        number
    spendingSurplusPercent: number
  }

  cashFlowView: {
    ccRepayments: {
      barclaycard: number
      natwestCC:   number
      hsbc:        number
      tesco:       number
      total:       number
      items:       LineItem[]
    }
    directSpending: number
    cashMovements: {
      monzoTransfer:   number   // net generic 'Transfer' category (positive = net outflow)
      savingsOut:      number
      savingsIn:       number
      savingsNet:      number
      familyTransfers: number   // net 'Family Transfer' category
      total:           number
    }
    totalOutflows: number
    cashRemaining: number
  }

  debtHealthIndicator: {
    ccSpendingThisPeriod:   number
    ccRepaymentsThisPeriod: number
    netDebtChange:          number   // repayments − spending (positive = paying down)
    trend:                  'paying_down' | 'accumulating' | 'neutral'
    trendAmount:            number
  }

  savings: {
    gross:       number
    returned:    number
    net:         number
    savingsRate: number
  }
}

// ─── Internal raw transaction type ───────────────────────────────────────────

type RawTx = {
  description:   string
  merchant_name: string | null
  amount:        number
  tag:           string | null
  category:      string | null
  transfer_flag: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sumAbs(txns: RawTx[]): number {
  return txns.reduce((s, t) => s + Math.abs(t.amount), 0)
}

function spendTotal(txns: RawTx[]): number {
  return txns.filter(t => !t.transfer_flag && t.amount < 0)
             .reduce((s, t) => s + Math.abs(t.amount), 0)
}

function spendByCategory(txns: RawTx[], category: string): number {
  return txns.filter(t => !t.transfer_flag && t.amount < 0 && t.category === category)
             .reduce((s, t) => s + Math.abs(t.amount), 0)
}

function identifyRepayment(t: RawTx): 'barclaycard' | 'natwestCC' | 'hsbc' | 'tesco' | 'other' {
  const desc = ((t.merchant_name || t.description) ?? '').toUpperCase()
  if (desc.includes('BARCLAYCARD'))                              return 'barclaycard'
  if (desc.includes('NWBNECTAR') || desc.includes('ACC-NWBNECTAR')) return 'natwestCC'
  if (desc.includes('HSBC'))                                     return 'hsbc'
  if (desc.includes('TESCO'))                                    return 'tesco'
  return 'other'
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function getFinancialSummary(
  supabase: SupabaseClient,
  start:    string,
  end:      string,
): Promise<FinancialSummary> {

  const today        = new Date().toISOString().slice(0, 10)
  const isClosedPeriod = end < today
  const cacheTitle   = `financial_summary_${start}_${end}`

  // ── 0. Cache check ─────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    let cacheQuery = supabase
      .from('ai_insights')
      .select('data')
      .eq('user_id', user.id)
      .eq('type', 'financial_summary')
      .eq('title', cacheTitle)
      .limit(1)
      .maybeSingle()

    if (!isClosedPeriod) {
      cacheQuery = supabase
        .from('ai_insights')
        .select('data')
        .eq('user_id', user.id)
        .eq('type', 'financial_summary')
        .eq('title', cacheTitle)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle()
    }

    const { data: cached } = await cacheQuery
    if (cached?.data?.summary) {
      return cached.data.summary as FinancialSummary
    }
  }

  // ── 1. Account IDs ─────────────────────────────────────────────────────────
  const { data: accts } = await supabase.from('accounts').select('id, name')
  const list    = accts ?? []
  const first   = (name: string) => list.find(a => a.name === name)?.id as string | undefined
  const allIds  = (match: (n: string) => boolean) => list.filter(a => match(a.name)).map(a => a.id as string)

  const nwMainId = first('NatWest Main')
  const barcId   = first('Barclaycard Rewards')
  const hsbcIds  = allIds(n => n.includes('HSBC') && n.includes('Credit'))
  const tescoIds = allIds(n => n.includes('Tesco') && n.includes('Credit'))
  const nwCCId   = first('NatWest Credit Card')

  // ── 2. Fetch transactions ──────────────────────────────────────────────────
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

  // ── 3. Income ──────────────────────────────────────────────────────────────
  const salary  = nwTxns.filter(t => t.tag === 'Income' && t.category === 'Salary')
                        .reduce((s, t) => s + t.amount, 0)
  const other   = nwTxns.filter(t => t.tag === 'Income' && t.category !== 'Salary')
                        .reduce((s, t) => s + t.amount, 0)
  const incomeTotal = salary + other

  const normalSalary = 3494.38
  const isBonus      = salary > normalSalary * 1.10
  const bonusAmount  = isBonus ? Math.round(salary - normalSalary) : 0

  // ── 4. Committed costs (Fixed tag) ─────────────────────────────────────────
  const fixedTxns = nwTxns.filter(t => t.tag === 'Fixed')
  const fixedSum  = (cat: string) => fixedTxns
    .filter(t => t.category === cat)
    .reduce((s, t) => s + Math.abs(t.amount), 0)

  const rent          = fixedSum('Rent')
  const carFinance    = fixedSum('Car Finance')
  const energy        = fixedSum('Energy')
  const councilTax    = fixedSum('Council Tax')
  const broadband     = fixedSum('Broadband')
  const mobile        = fixedSum('Mobile')
  const insurance     = fixedSum('Insurance')
  const tvLicence     = fixedSum('TV & News')
  const carTax        = fixedSum('Car Tax')
  const subscriptions = fixedSum('Subscriptions')
  const bankCharges   = fixedSum('Bank Charges')
  const committedTotal = sumAbs(fixedTxns)

  // Items: non-rent, non-carFinance fixed bills grouped by merchant
  const billMap = new Map<string, { amount: number; category: string | null }>()
  for (const t of fixedTxns.filter(t => t.category !== 'Rent' && t.category !== 'Car Finance')) {
    const key  = t.merchant_name || t.description
    const prev = billMap.get(key) ?? { amount: 0, category: t.category }
    billMap.set(key, { amount: prev.amount + Math.abs(t.amount), category: t.category })
  }
  const committedItems = Array.from(billMap.entries())
    .map(([name, v]) => ({ name, amount: v.amount, category: v.category }))
    .sort((a, b) => b.amount - a.amount)

  // ── 5. Spending view — direct NatWest discretionary ────────────────────────
  const discretNW = nwTxns.filter(t => t.tag === 'Discretionary')
  const nwFuel      = discretNW.filter(t => t.category === 'Fuel').reduce((s, t) => s + Math.abs(t.amount), 0)
  const nwStaffShop = discretNW.filter(t => t.category === 'Staff Shop').reduce((s, t) => s + Math.abs(t.amount), 0)
  const nwOther     = discretNW.filter(t => t.category !== 'Fuel' && t.category !== 'Staff Shop').reduce((s, t) => s + Math.abs(t.amount), 0)
  const nwDirectTotal = nwFuel + nwStaffShop + nwOther

  // ── 6. Spending view — CC accounts ─────────────────────────────────────────

  // Barclaycard breakdown by category
  const barcSpend = bcTxns.filter(t => !t.transfer_flag && t.amount < 0)
  const knownBarcCats = ['Groceries', 'Dining Out', 'Fuel', 'Medical', 'Personal Care']
  const barcGroceries = spendByCategory(bcTxns, 'Groceries')
  const barcDining    = spendByCategory(bcTxns, 'Dining Out')
  const barcFuel      = spendByCategory(bcTxns, 'Fuel')
  const barcMedical   = spendByCategory(bcTxns, 'Medical')
  const barcPersonal  = spendByCategory(bcTxns, 'Personal Care')
  const barcOther     = barcSpend
    .filter(t => !knownBarcCats.includes(t.category ?? ''))
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const barcTotal = barcGroceries + barcDining + barcFuel + barcMedical + barcPersonal + barcOther

  // NatWest CC (fuel-focused)
  const nwCCFuel  = spendByCategory(nwCCTxns, 'Fuel')
  const nwCCTotal = spendTotal(nwCCTxns)

  // HSBC and Tesco totals
  const hsbcTotal  = spendTotal(hsbcTxns)
  const tescoTotal = spendTotal(tescoTxns)

  const totalCCSpending = barcTotal + nwCCTotal + hsbcTotal + tescoTotal
  const totalSpending   = nwDirectTotal + totalCCSpending
  const spendingSurplus = incomeTotal - committedTotal - totalSpending
  const spendingSurplusPercent = incomeTotal > 0 ? (spendingSurplus / incomeTotal) * 100 : 0

  // ── 7. Cash flow view — transfers ──────────────────────────────────────────
  const nwTransfersOut = nwTxns.filter(t => t.transfer_flag && t.amount < 0)
  const nwTransfersIn  = nwTxns.filter(t => t.transfer_flag && t.amount > 0)

  // CC repayments: null-category outbound transfers, identified by description
  const ccRepayTxns = nwTransfersOut.filter(t => !t.category)
  const barcRepay   = ccRepayTxns.filter(t => identifyRepayment(t) === 'barclaycard').reduce((s, t) => s + Math.abs(t.amount), 0)
  const nwCCRepay   = ccRepayTxns.filter(t => identifyRepayment(t) === 'natwestCC').reduce((s, t) => s + Math.abs(t.amount), 0)
  const hsbcRepay   = ccRepayTxns.filter(t => identifyRepayment(t) === 'hsbc').reduce((s, t) => s + Math.abs(t.amount), 0)
  const tescoRepay  = ccRepayTxns.filter(t => identifyRepayment(t) === 'tesco').reduce((s, t) => s + Math.abs(t.amount), 0)
  const ccRepayTotal = sumAbs(ccRepayTxns)
  const ccRepayItems: LineItem[] = ccRepayTxns.map(t => ({
    name:   t.merchant_name || t.description,
    amount: Math.abs(t.amount),
  }))

  // Savings
  const savingsOut = nwTransfersOut.filter(t => t.category === 'Savings Transfer').reduce((s, t) => s + Math.abs(t.amount), 0)
  const savingsIn  = nwTransfersIn.filter(t => t.category === 'Savings Transfer').reduce((s, t) => s + t.amount, 0)
  const savingsNet = savingsOut - savingsIn

  // Generic/Monzo transfers (net — positive = net outflow)
  const monzoOut = nwTransfersOut.filter(t => t.category === 'Transfer').reduce((s, t) => s + Math.abs(t.amount), 0)
  const monzoIn  = nwTransfersIn.filter(t => t.category === 'Transfer').reduce((s, t) => s + t.amount, 0)
  const monzoNet = monzoOut - monzoIn

  // Family transfers (net)
  const familyOut = nwTransfersOut.filter(t => t.category === 'Family Transfer').reduce((s, t) => s + Math.abs(t.amount), 0)
  const familyIn  = nwTransfersIn.filter(t => t.category === 'Family Transfer').reduce((s, t) => s + t.amount, 0)
  const familyNet = familyOut - familyIn

  const cashMovementsTotal = monzoNet + savingsNet + familyNet
  const totalOutflows      = committedTotal + ccRepayTotal + nwDirectTotal + cashMovementsTotal
  const cashRemaining      = incomeTotal - totalOutflows

  // ── 8. Debt health ─────────────────────────────────────────────────────────
  const netDebtChange = ccRepayTotal - totalCCSpending
  const trend: 'paying_down' | 'accumulating' | 'neutral' =
    netDebtChange > 50 ? 'paying_down' : netDebtChange < -50 ? 'accumulating' : 'neutral'

  // ── 9. Period label ────────────────────────────────────────────────────────
  const periodLabel = new Date(start + 'T00:00:00')
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  // ── 10. Assemble result ───────────────────────────────────────────────────
  const result: FinancialSummary = {
    period: { start, end, label: periodLabel },

    income: {
      salary,
      isBonus,
      normalSalary: Math.round(normalSalary),
      bonusAmount,
      other,
      total: incomeTotal,
    },

    committedCosts: {
      rent,
      carFinance,
      energy,
      councilTax,
      broadband,
      mobile,
      insurance,
      tvLicence,
      carTax,
      subscriptions,
      bankCharges,
      total:  committedTotal,
      items:  committedItems,
    },

    spendingView: {
      barclaycard: {
        groceries: barcGroceries,
        dining:    barcDining,
        fuel:      barcFuel,
        medical:   barcMedical,
        personal:  barcPersonal,
        other:     barcOther,
        total:     barcTotal,
      },
      natwestCC: { fuel: nwCCFuel, total: nwCCTotal },
      hsbc:      { total: hsbcTotal },
      tesco:     { total: tescoTotal },
      directFromNatwest: {
        fuel:      nwFuel,
        staffShop: nwStaffShop,
        other:     nwOther,
        total:     nwDirectTotal,
      },
      totalSpending,
      spendingSurplus,
      spendingSurplusPercent,
    },

    cashFlowView: {
      ccRepayments: {
        barclaycard: barcRepay,
        natwestCC:   nwCCRepay,
        hsbc:        hsbcRepay,
        tesco:       tescoRepay,
        total:       ccRepayTotal,
        items:       ccRepayItems,
      },
      directSpending: nwDirectTotal,
      cashMovements: {
        monzoTransfer:   monzoNet,
        savingsOut,
        savingsIn,
        savingsNet,
        familyTransfers: familyNet,
        total:           cashMovementsTotal,
      },
      totalOutflows,
      cashRemaining,
    },

    debtHealthIndicator: {
      ccSpendingThisPeriod:   totalCCSpending,
      ccRepaymentsThisPeriod: ccRepayTotal,
      netDebtChange,
      trend,
      trendAmount: Math.abs(netDebtChange),
    },

    savings: {
      gross:       savingsOut,
      returned:    savingsIn,
      net:         savingsNet,
      savingsRate: salary > 0 ? savingsNet / salary : 0,
    },
  }

  // ── 11. Write to cache ─────────────────────────────────────────────────────
  if (user) {
    await supabase
      .from('ai_insights')
      .delete()
      .eq('user_id', user.id)
      .eq('type', 'financial_summary')
      .eq('title', cacheTitle)

    await supabase.from('ai_insights').insert({
      user_id:    user.id,
      type:       'financial_summary',
      title:      cacheTitle,
      body:       'cached',
      data:       { summary: result },
      expires_at: isClosedPeriod
        ? null
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  return result
}
