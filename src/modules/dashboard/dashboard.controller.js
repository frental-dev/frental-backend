const dashboardService = require('./dashboard.service');

async function getDashboard(req, res, next) {
  try {
    const dashboard = await dashboardService.getDashboard(req.agent.id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
