const clientService = require('./client.service');

async function create(req, res, next) {
  try {
    const client = await clientService.createClient(req.agent.id, req.body);
    res.status(201).json({ client });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const client = await clientService.getClient(req.params.clientId, req.agent.id);
    res.json({ client });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { status, search } = req.query;
    const clients = await clientService.listClients(req.agent.id, { status, search });
    res.json({ clients });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const client = await clientService.updateClient(req.params.clientId, req.agent.id, req.body);
    res.json({ client });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await clientService.deleteClient(req.params.clientId, req.agent.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { create, getOne, list, update, remove };
