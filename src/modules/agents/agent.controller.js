const agentService = require("./agent.service");

async function signup(req, res, next) {
  try {
    const result = await agentService.signup(req.body, req);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await agentService.login(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function googleAuth(req, res, next) {
  try {
    const result = await agentService.googleAuth(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await agentService.refreshAccessToken(
      req.body.refreshToken,
      req,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" });
    }
    const result = await agentService.logout(refreshToken, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    const result = await agentService.logoutAll(req.agent.id, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await agentService.listSessions(req.agent.id);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

async function revokeSession(req, res, next) {
  try {
    const result = await agentService.revokeSession(
      req.agent.id,
      req.params.sessionId,
    );
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
    const result = await agentService.changePassword(
      req.agent.id,
      req.body,
      req,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resendVerification(req, res, next) {
  try {
    const result = await agentService.resendVerification(req.agent.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function requestEmailChange(req, res, next) {
  try {
    const result = await agentService.requestEmailChange(
      req.agent.id,
      req.body,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const result = await agentService.requestPasswordReset(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const result = await agentService.resetPassword(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setAccountStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(status)) {
      return res
        .status(400)
        .json({ error: "status must be ACTIVE, SUSPENDED, or DISABLED" });
    }
    const agent = await agentService.setAccountStatus(
      req.params.agentId,
      status,
      req,
    );
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

// --- HTML pages, opened from links inside emails, not called as JSON API ---

function statusPage({ title, message, ok }) {
  return `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>${title}</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
        <div style="text-align: center; max-width: 400px; padding: 32px;">
          <div style="font-size: 40px;">${ok ? "✅" : "⚠️"}</div>
          <h2 style="color: #111827; margin-top: 16px;">${title}</h2>
          <p style="color: #6b7280;">${message}</p>
        </div>
      </body>
    </html>
  `;
}

// async function verifyEmail(req, res) {
//   const { token } = req.query;
//   if (!token) {
//     return res.status(400).send(statusPage({ title: 'Missing verification token', message: 'This link is missing its code.', ok: false }));
//   }
//   try {
//     await agentService.verifyEmailToken(token, req);
//     res.send(statusPage({ title: 'Email verified', message: 'You can close this page and return to the app.', ok: true }));
//   } catch (err) {
//     res.status(err.statusCode || 400).send(statusPage({ title: 'Verification failed', message: err.message, ok: false }));
//   }
// }
async function verifyEmailCode(req, res, next) {
  try {
    const result = await agentService.verifyEmailCode(
      req.agent.id,
      req.body.code,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function confirmEmailChange(req, res) {
  const { token } = req.query;
  if (!token) {
    return res
      .status(400)
      .send(
        statusPage({
          title: "Missing confirmation token",
          message: "This link is missing its code.",
          ok: false,
        }),
      );
  }
  try {
    await agentService.confirmEmailChange(token, req);
    res.send(
      statusPage({
        title: "Email updated",
        message: "Your new email is confirmed. You can close this page.",
        ok: true,
      }),
    );
  } catch (err) {
    res
      .status(err.statusCode || 400)
      .send(
        statusPage({
          title: "Confirmation failed",
          message: err.message,
          ok: false,
        }),
      );
  }
}

function resetPasswordPage(req, res) {
  const { token } = req.query;
  if (!token) {
    return res
      .status(400)
      .send(
        '<p style="font-family:sans-serif;text-align:center;margin-top:80px;">Missing reset token.</p>',
      );
  }

  res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Reset your Frental password</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
        <div style="width: 100%; max-width: 360px; padding: 32px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #111827; margin-top: 0;">Reset your password</h2>
          <form id="reset-form">
            <input type="password" id="newPassword" placeholder="New password (min 8 characters)" minlength="8" required
              style="width: 100%; box-sizing: border-box; padding: 10px 12px; margin-bottom: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;" />
            <button type="submit"
              style="width: 100%; padding: 10px; background: #186339; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
              Set new password
            </button>
          </form>
          <p id="result" style="margin-top: 16px; font-size: 14px;"></p>
        </div>
        <script>
          document.getElementById('reset-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const resultEl = document.getElementById('result');
            resultEl.textContent = 'Saving…';
            try {
              const res = await fetch('/api/agents/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: ${JSON.stringify(token)}, newPassword }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Something went wrong');
              resultEl.style.color = '#186339';
              resultEl.textContent = 'Password updated — you can close this page and log in with your new password.';
              document.getElementById('reset-form').style.display = 'none';
            } catch (err) {
              resultEl.style.color = '#dc2626';
              resultEl.textContent = err.message;
            }
          });
        </script>
      </body>
    </html>
  `);
}

module.exports = {
  signup,
  login,
  googleAuth,
  refresh,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  me,
  publicProfile,
  updateProfile,
  changePassword,
  resendVerification,
  requestEmailChange,
  forgotPassword,
  resetPassword,
  setAccountStatus,
  verifyEmailCode,
  confirmEmailChange,
  resetPasswordPage,
};
