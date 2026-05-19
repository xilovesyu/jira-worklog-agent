import express from 'express'
import { getTodayDate } from '../utils.mjs'
import {
  getAiConfig,
  saveAiConfig,
  getLlmCostStats,
  getAiDecisionHistory,
  getAiDecisionByDate,
  markDecisionOverride,
  saveAiDecision
} from '../storage.mjs'
import {
  generateAiRecommendation,
  executeAiRecommendation
} from '../ai/intelligentDecision.mjs'
import { getLlmStatus, isLlmAvailable } from '../ai/llmEngine.mjs'

const router = express.Router()

/**
 * Register AI routes on Express app
 */
export function registerAiRoutes(app) {
  app.use('/api/ai', router)
}

// ========== Recommendation ==========

/**
 * GET /api/ai/recommendation
 * Get AI recommendation for a specific date
 */
router.get('/recommendation', async (req, res) => {
  try {
    const date = req.query.date || getTodayDate()

    const recommendation = await generateAiRecommendation(date)

    res.json(recommendation)
  } catch (err) {
    console.error('Error getting AI recommendation:', err)
    res.status(500).json({
      error: 'Failed to generate recommendation',
      message: err.message
    })
  }
})

/**
 * POST /api/ai/submit
 * Submit AI recommendation (with optional override)
 */
router.post('/submit', async (req, res) => {
  try {
    const { allocation, date, override, decisionId } = req.body

    // Build recommendation object
    const recommendation = {
      id: decisionId,
      recommendation: {
        allocation: override || allocation
      },
      explanation: override ? '用户修改的分配' : 'AI推荐'
    }

    // If user override, mark decision
    if (override && decisionId) {
      markDecisionOverride(decisionId, override)
    }

    // Execute submission
    const result = await executeAiRecommendation(recommendation, date)

    if (result.success) {
      res.json({
        success: true,
        message: `Successfully submitted worklog for ${result.totalHours} hours`,
        results: result.results
      })
    } else {
      res.status(400).json({
        success: false,
        message: 'Some worklogs failed to submit',
        results: result.results
      })
    }
  } catch (err) {
    console.error('Error submitting AI recommendation:', err)
    res.status(500).json({
      error: 'Failed to submit recommendation',
      message: err.message
    })
  }
})

// ========== Configuration ==========

/**
 * GET /api/ai/config
 * Get AI configuration (automation config from SQLite + LLM config from config.yaml)
 */
router.get('/config', (req, res) => {
  try {
    const aiConfig = getAiConfig()        // Automation config from SQLite
    const llmStatus = getLlmStatus()       // LLM status from config.yaml/.env

    res.json({
      // AI automation config (editable via API)
      automation_level: aiConfig.automation_level,
      confidence_threshold: aiConfig.confidence_threshold,
      auto_submit_time: aiConfig.auto_submit_time,
      notify_before_submit: aiConfig.notify_before_submit,

      // LLM config (read-only, edit config.yaml to change)
      llm_provider: llmStatus.provider,
      llm_model: llmStatus.model,
      llm_base_url: llmStatus.base_url,
      llm_enabled: llmStatus.enabled,
      llmAvailable: llmStatus.available
    })
  } catch (err) {
    console.error('Error getting AI config:', err)
    res.status(500).json({
      error: 'Failed to get AI config',
      message: err.message
    })
  }
})

/**
 * POST /api/ai/config
 * Update AI automation configuration (LLM config is in config.yaml, edit that file directly)
 */
router.post('/config', (req, res) => {
  try {
    // Only save automation config, ignore LLM fields
    const automationConfig = {
      automation_level: req.body.automation_level,
      confidence_threshold: req.body.confidence_threshold,
      auto_submit_time: req.body.auto_submit_time,
      notify_before_submit: req.body.notify_before_submit
    }

    saveAiConfig(automationConfig)

    res.json({
      success: true,
      message: 'AI automation config updated. LLM config is in config.yaml (edit file directly)'
    })
  } catch (err) {
    console.error('Error saving AI config:', err)
    res.status(500).json({
      error: 'Failed to save AI config',
      message: err.message
    })
  }
})

// ========== History ==========

/**
 * GET /api/ai/history
 * Get AI decision history for a date range
 */
router.get('/history', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30

    const history = getAiDecisionHistory(days)

    res.json(history)
  } catch (err) {
    console.error('Error getting AI history:', err)
    res.status(500).json({
      error: 'Failed to get AI history',
      message: err.message
    })
  }
})

// ========== LLM Status ==========

/**
 * GET /api/ai/llm/status
 * Get LLM provider status
 */
router.get('/llm/status', (req, res) => {
  try {
    const status = getLlmStatus()

    res.json(status)
  } catch (err) {
    console.error('Error getting LLM status:', err)
    res.status(500).json({
      error: 'Failed to get LLM status',
      message: err.message
    })
  }
})

/**
 * GET /api/ai/llm/cost
 * Get LLM cost statistics
 */
router.get('/llm/cost', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30

    const stats = getLlmCostStats(days)

    res.json(stats)
  } catch (err) {
    console.error('Error getting LLM cost:', err)
    res.status(500).json({
      error: 'Failed to get LLM cost',
      message: err.message
    })
  }
})