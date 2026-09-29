const propertyService = require('./property.service');

async function create(req, res, next) {
  try {
    const property = await propertyService.createProperty(req.agent.id, req.body);
    res.status(201).json({ property });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const property = await propertyService.getProperty(req.params.propertyId, { agentId: req.agent.id });
    res.json({ property });
  } catch (err) { next(err); }
}

async function listMine(req, res, next) {
  try {
    const { status } = req.query;
    const properties = await propertyService.listAgentProperties(req.agent.id, { status });
    res.json({ properties });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const property = await propertyService.updateProperty(req.params.propertyId, req.agent.id, req.body);
    res.json({ property });
  } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    const property = await propertyService.setStatus(req.params.propertyId, req.agent.id, status);
    res.json({ property });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await propertyService.deleteProperty(req.params.propertyId, req.agent.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function search(req, res, next) {
  try {
    const properties = await propertyService.searchAgentProperties(req.agent.id, req.query.query);
    res.json({ properties });
  } catch (err) {
    // Validation errors (400, e.g. missing query) already carry the right
    // message — pass those through unchanged. Anything unexpected gets the
    // exact wording the Android spec asks for, rather than a raw internal
    // error message reaching the client.
    if (err.statusCode) return next(err);
    console.error('[properties] search failed:', err);
    const wrapped = new Error('Failed to execute property search.');
    wrapped.statusCode = 500;
    next(wrapped);
  }
}

module.exports = { create, getOne, listMine, update, updateStatus, remove, search };
