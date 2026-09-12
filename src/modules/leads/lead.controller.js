const leadService = require('./lead.service');

async function createPublic(req, res, next) {
  try {
    const lead = await leadService.createPublicLead(req.body);
    res.status(201).json({ lead });
  } catch (err) { next(err); }
}

async function createManual(req, res, next) {
  try {
    const lead = await leadService.createManualLead(req.agent.id, req.body);
    res.status(201).json({ lead });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { status, source } = req.query;
    const leads = await leadService.listLeads(req.agent.id, { status, source });
    res.json({ leads });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const lead = await leadService.getLead(req.params.leadId, req.agent.id);
    res.json({ lead });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const lead = await leadService.updateLead(req.params.leadId, req.agent.id, req.body);
    res.json({ lead });
  } catch (err) { next(err); }
}

async function convert(req, res, next) {
  try {
    const result = await leadService.convertToClient(req.params.leadId, req.agent.id, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await leadService.deleteLead(req.params.leadId, req.agent.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { createPublic, createManual, list, getOne, update, convert, remove };
