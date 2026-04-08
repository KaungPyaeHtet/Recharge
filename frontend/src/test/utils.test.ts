import { describe, it, expect } from 'vitest'
import { cleanLabel, riskBand, RISK_COLORS, WARNING_STYLES } from '../utils'

describe('cleanLabel', () => {
  it('maps known ML feature keys to human labels', () => {
    expect(cleanLabel('mental_fatigue_score')).toBe('Mental Fatigue')
    expect(cleanLabel('resource_allocation')).toBe('Workload')
    expect(cleanLabel('designation')).toBe('Seniority Level')
    expect(cleanLabel('tenure_days')).toBe('Time at Company')
    expect(cleanLabel('wfh_setup_available')).toBe('Remote Work Access')
  })

  it('strips "cat " prefix from raw ML categorical labels', () => {
    expect(cleanLabel('cat WFH Setup Available No')).toBe('Remote Work Access')
    expect(cleanLabel('cat Gender Male')).toBe('Gender')
    expect(cleanLabel('cat Company Type Service')).toBe('Company Type')
  })

  it('strips "num " prefix and title-cases unknown features', () => {
    expect(cleanLabel('num some_feature')).toBe('Some Feature')
  })

  it('title-cases plain underscore names with no known key', () => {
    expect(cleanLabel('unknown_feature_name')).toBe('Unknown Feature Name')
  })

  it('handles already-clean labels without mangling them', () => {
    expect(cleanLabel('Mental Fatigue Score')).toBe('Mental Fatigue')
  })
})

describe('riskBand', () => {
  it('returns "low" below 0.35', () => {
    expect(riskBand(0)).toBe('low')
    expect(riskBand(0.1)).toBe('low')
    expect(riskBand(0.34)).toBe('low')
  })

  it('returns "moderate" from 0.35 to 0.64', () => {
    expect(riskBand(0.35)).toBe('moderate')
    expect(riskBand(0.5)).toBe('moderate')
    expect(riskBand(0.64)).toBe('moderate')
  })

  it('returns "high" at 0.65 and above', () => {
    expect(riskBand(0.65)).toBe('high')
    expect(riskBand(0.9)).toBe('high')
    expect(riskBand(1.0)).toBe('high')
  })
})

describe('RISK_COLORS', () => {
  it('has entries for all three bands', () => {
    expect(RISK_COLORS.low.label).toBe('Low Risk')
    expect(RISK_COLORS.moderate.label).toBe('Moderate Risk')
    expect(RISK_COLORS.high.label).toBe('High Risk')
  })
})

describe('WARNING_STYLES', () => {
  it('has entries for all four warning levels', () => {
    const levels = ['stable', 'watch', 'warning', 'critical'] as const
    for (const level of levels) {
      expect(WARNING_STYLES[level]).toHaveProperty('bg')
      expect(WARNING_STYLES[level]).toHaveProperty('border')
      expect(WARNING_STYLES[level]).toHaveProperty('text')
    }
  })
})
