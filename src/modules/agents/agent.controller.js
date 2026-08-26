const agentService = require('./agent.service');

async function signup(req, res, next) {
  try {
    const { name, phone, whatsapp, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const result = await agentService.signup({ name, phone, whatsapp, email, password });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }

    const result = await agentService.login({ phone, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const agent = await agentService.getById(req.agent.id);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

async function publicProfile(req, res, next) {
  try {
    const { slug } = req.params;
    const agent = await agentService.getPublicBySlug(slug);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const agent = await agentService.updateProfile(req.agent.id, req.body);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const result = await agentService.changePassword(req.agent.id, { currentPassword, newPassword });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, me, publicProfile, updateProfile, changePassword };
