const marketplaceService = require('./marketplace.service');

async function search(req, res, next) {
  try {
    const data = await marketplaceService.searchProperties(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const property = await marketplaceService.getPublicProperty(req.params.propertyId);
    res.json({ property });
  } catch (err) {
    next(err);
  }
}

module.exports = { search, getOne };
