const viewingService = require('./viewing.service');

async function create(req, res, next) {
  try {
    const viewing = await viewingService.createViewing(req.agent.id, req.body);
    res.status(201).json({ viewing });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const viewing = await viewingService.getViewing(req.params.viewingId, req.agent.id);
    res.json({ viewing });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, from, to } = req.query;
    const viewings = await viewingService.listViewings(req.agent.id, { status, from, to });
    res.json({ viewings });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const viewing = await viewingService.updateViewing(req.params.viewingId, req.agent.id, req.body);
    res.json({ viewing });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    const viewing = await viewingService.setStatus(req.params.viewingId, req.agent.id, status);
    res.json({ viewing });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await viewingService.deleteViewing(req.params.viewingId, req.agent.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, list, update, updateStatus, remove };
