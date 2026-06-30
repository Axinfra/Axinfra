import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? 'Axinfra <dev@axinfra.in>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'dev@axinfra.in';

let resendClient: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set. Configure it in Vercel project environment variables.');
  }

  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Shared template shell ────────────────────────────────────────────────────

function baseTemplate(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Axinfra</title>
</head>
<body style="margin:0;padding:0;background:#0d0d11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d11;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Logo header -->
        <tr><td style="padding-bottom:28px;text-align:center;">
          <span style="font-size:22px;font-weight:800;color:#c4a35a;letter-spacing:-0.5px;">Axinfra</span>
          <span style="font-size:13px;color:rgba(232,228,220,0.4);margin-left:6px;">Project Intelligence</span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#16161c;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:36px 32px;">
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="font-size:11px;color:rgba(232,228,220,0.25);margin:0;">
            Axinfra · ${escapeHtml(SUPPORT_EMAIL)}<br/>
            You're receiving this because you have an account on the platform.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(label: string, url: string, color = '#c4a35a'): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
    <tr><td style="background:${color};border-radius:10px;text-align:center;">
      <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#0d0d11;text-decoration:none;letter-spacing:-0.2px;">${label}</a>
    </td></tr>
  </table>`;
}

function credential(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:11.5px;color:rgba(232,228,220,0.45);">${label}</span>
    </td>
    <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;">
      <span style="font-size:13px;font-weight:600;color:#e8e4dc;font-family:monospace;">${escapeHtml(value)}</span>
    </td>
  </tr>`;
}

// ── Email senders ────────────────────────────────────────────────────────────

export async function sendSignupWelcomeEmail(to: string, name: string) {
  const loginUrl = `${APP_URL}/auth/login`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">Welcome to Axinfra</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(name)}, your account is ready. You can now sign in and start managing your construction projects.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">
      ${credential('Login email', to)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      Use the password you set during sign-up. You can change it at any time from your profile settings.
    </p>

    ${btn('Go to Axinfra', loginUrl)}
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: 'Welcome to Axinfra — your account is ready',
    html,
  });
}

export async function sendWelcomeEmail(to: string, name: string, password: string) {
  const loginUrl = `${APP_URL}/auth/login`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">Welcome to Axinfra</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(name)}, your account has been created. Here are your login credentials:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">
      ${credential('Email (login ID)', to)}
      ${credential('Password', password)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      Keep this email safe. You can change your password after logging in via your profile settings.
    </p>

    ${btn('Log in to Axinfra', loginUrl)}
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: 'Welcome to Axinfra — your account is ready',
    html,
  });
}

export async function sendPasswordChangedEmail(to: string, name: string, newPassword: string) {
  const loginUrl = `${APP_URL}/auth/login`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">Password Updated</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(name)}, an admin has reset your Axinfra password.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">
      ${credential('Email', to)}
      ${credential('New password', newPassword)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      If you didn't expect this change, contact your project admin immediately.
    </p>

    ${btn('Log in now', loginUrl)}
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: 'Your Axinfra password has been changed',
    html,
  });
}

export async function sendEmailChangedEmail(
  oldEmail: string,
  newEmail: string,
  name: string,
) {
  const loginUrl = `${APP_URL}/auth/login`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">Login Email Updated</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(name)}, your Axinfra login email has been changed by an admin.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">
      ${credential('Previous email', oldEmail)}
      ${credential('New email', newEmail)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      Use your new email address to log in. If you didn't expect this, contact your admin.
    </p>

    ${btn('Log in with new email', loginUrl)}
  `);

  // Notify both old and new addresses
  await getResend().emails.send({ from: FROM, to: oldEmail, subject: 'Your Axinfra login email has been changed', html });
  return getResend().emails.send({ from: FROM, to: newEmail, subject: 'Your Axinfra login email has been changed', html });
}

export async function sendSupportEmail(
  fromName: string,
  fromEmail: string,
  subject: string,
  message: string,
) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">New Support Request</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">A user has submitted a support request from the Axinfra homepage.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:16px;">
      ${credential('Name', fromName)}
      ${credential('Email', fromEmail)}
      ${credential('Subject', subject)}
    </table>

    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px;">
      <p style="font-size:11.5px;color:rgba(232,228,220,0.45);margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
      <p style="font-size:13.5px;color:#e8e4dc;margin:0;line-height:1.7;white-space:pre-wrap;">${escapeHtml(message)}</p>
    </div>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:16px 0 0;">
      Reply directly to this email to respond to <strong style="color:rgba(232,228,220,0.6);">${escapeHtml(fromEmail)}</strong>.
    </p>
  `);

  // Send to support inbox
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_EMAIL,
    replyTo: fromEmail,
    subject: `[Support] ${subject}`,
    html,
  });

  // Send confirmation to user
  const confirmHtml = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">We received your message</h1>
    <p style="margin:0 0 20px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(fromName)}, thanks for reaching out. Our team will get back to you at <strong style="color:#e8e4dc;">${escapeHtml(fromEmail)}</strong> within 1–2 business days.</p>

    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px;">
      <p style="font-size:11.5px;color:rgba(232,228,220,0.45);margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your message</p>
      <p style="font-size:13px;color:rgba(232,228,220,0.65);margin:0;line-height:1.7;white-space:pre-wrap;">${escapeHtml(message)}</p>
    </div>
  `);

  return getResend().emails.send({
    from: FROM,
    to: fromEmail,
    subject: 'We received your message — Axinfra Support',
    html: confirmHtml,
  });
}

export async function sendProjectInviteEmail(
  to: string,
  inviterName: string,
  projectName: string,
  role: string,
  inviteToken: string,
) {
  const acceptUrl = `${APP_URL}/invite/${inviteToken}`;
  const roleLabel: Record<string, string> = {
    CLIENT: 'Project Owner',
    PMC: 'Project Management Consultant',
    VENDOR: 'Vendor',
    CONSULTANT: 'Consultant',
    VIEWER: 'Viewer',
  };
  const roleDescriptions: Record<string, string> = {
    CLIENT: 'Full oversight of payments, BOQ approvals, and project financials.',
    PMC: 'Create BOQ, govern milestones, verify evidence, and manage vendors.',
    VENDOR: 'Execute work on-site, submit evidence for milestones and receive payments.',
    CONSULTANT: 'Upload documents, review evidence, and export audit logs.',
    VIEWER: 'Read-only access to project status, milestones, and reports.',
  };

  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">You're invited to a project</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">
      <strong style="color:#e8e4dc;">${escapeHtml(inviterName)}</strong> has invited you to collaborate on a project on Axinfra.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:20px;">
      ${credential('Project', projectName)}
      ${credential('Your role', roleLabel[role] ?? role)}
    </table>

    <div style="background:rgba(196,163,90,0.06);border:1px solid rgba(196,163,90,0.15);border-radius:10px;padding:14px 16px;margin-bottom:8px;">
      <p style="font-size:11.5px;color:rgba(232,228,220,0.45);margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">What you'll be able to do</p>
      <p style="font-size:13px;color:rgba(232,228,220,0.7);margin:0;line-height:1.6;">${escapeHtml(roleDescriptions[role] ?? 'Access the project on Axinfra.')}</p>
    </div>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      Click the button below to create your account and accept this invitation. The link expires in 30 days.
    </p>

    ${btn('Accept Invitation', acceptUrl)}

    <p style="font-size:11px;color:rgba(232,228,220,0.25);margin:20px 0 0;text-align:center;">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: `${escapeHtml(inviterName)} invited you to "${projectName}" on Axinfra`,
    html,
  });
}

export async function sendDemoRequestEmail(
  name: string,
  email: string,
  company: string,
  phone: string,
  message: string,
) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">New Demo Request</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">Someone has requested a product demo from the Axinfra website.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:16px;">
      ${credential('Name', name)}
      ${credential('Email', email)}
      ${credential('Company', company)}
      ${credential('Phone', phone || 'Not provided')}
    </table>

    ${message ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px;">
      <p style="font-size:11.5px;color:rgba(232,228,220,0.45);margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Additional Message</p>
      <p style="font-size:13.5px;color:#e8e4dc;margin:0;line-height:1.7;white-space:pre-wrap;">${escapeHtml(message)}</p>
    </div>` : ''}

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:16px 0 0;">
      Reply directly to this email to respond to <strong style="color:rgba(232,228,220,0.6);">${escapeHtml(email)}</strong>.
    </p>
  `);

  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_EMAIL,
    replyTo: email,
    subject: `[Demo Request] ${name} — ${company}`,
    html,
  });

  const confirmHtml = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">Demo request received!</h1>
    <p style="margin:0 0 20px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(name)}, thanks for your interest in Axinfra. Our team will reach out to <strong style="color:#e8e4dc;">${escapeHtml(email)}</strong> within 1 business day to schedule your demo.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">
      ${credential('Company', company)}
      ${credential('Contact', phone || 'Not provided')}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      In the meantime, you can explore our platform overview at axinfra.in.
    </p>
  `);

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: 'Demo request received — Axinfra',
    html: confirmHtml,
  });
}

export async function sendRoleConflictInviteEmail(
  to: string,
  name: string,
  inviterName: string,
  projectName: string,
  assignedRole: string,
  registeredRole: string,
  inviteToken: string,
) {
  const acceptUrl = `${APP_URL}/invite/${inviteToken}`;
  const roleLabel: Record<string, string> = {
    CLIENT: 'Project Owner',
    PMC: 'Project Management Consultant',
    VENDOR: 'Vendor',
    CONSULTANT: 'Consultant',
    VIEWER: 'Viewer',
  };

  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">You've been invited to a project</h1>
    <p style="margin:0 0 20px;font-size:13.5px;color:rgba(232,228,220,0.55);">
      Hi ${escapeHtml(name)}, <strong style="color:#e8e4dc;">${escapeHtml(inviterName)}</strong> has invited you to collaborate on a project on Axinfra.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:16px;">
      ${credential('Project', projectName)}
      ${credential('Invited by', inviterName)}
      ${credential('Role for this project', roleLabel[assignedRole] ?? assignedRole)}
    </table>

    <div style="background:rgba(224,152,64,0.07);border:1px solid rgba(224,152,64,0.22);border-radius:10px;padding:14px 16px;margin-bottom:16px;">
      <p style="font-size:11.5px;color:rgba(232,228,220,0.5);margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Role Change Notice</p>
      <p style="font-size:13px;color:rgba(232,228,220,0.75);margin:0;line-height:1.6;">
        Your account is registered as <strong style="color:#e8e4dc;">${escapeHtml(roleLabel[registeredRole] ?? registeredRole)}</strong>.
        ${escapeHtml(inviterName)} is inviting you to this project as <strong style="color:#e8e4dc;">${escapeHtml(roleLabel[assignedRole] ?? assignedRole)}</strong> instead.
        Click Accept if you agree to participate in this role.
      </p>
    </div>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:0 0 4px;">
      This invitation link expires in 30 days. You must sign in with <strong style="color:rgba(232,228,220,0.55);">${escapeHtml(to)}</strong> to accept.
    </p>

    ${btn('Accept Invitation', acceptUrl)}

    <p style="font-size:11px;color:rgba(232,228,220,0.25);margin:20px 0 0;text-align:center;">
      If you weren&apos;t expecting this invitation, you can safely ignore this email.
    </p>
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: `${escapeHtml(inviterName)} invited you to "${projectName}" on Axinfra`,
    html,
  });
}

export async function sendProjectAssignedEmail(
  to: string,
  name: string,
  projectName: string,
  role: string,
  projectId: string,
) {
  const projectUrl = `${APP_URL}/projects/${projectId}`;
  const roleLabel: Record<string, string> = {
    CLIENT: 'Client',
    PMC: 'Project Management Consultant',
    VENDOR: 'Vendor',
    CONSULTANT: 'Consultant',
    VIEWER: 'Viewer',
  };

  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">You've been added to a project</h1>
    <p style="margin:0 0 24px;font-size:13.5px;color:rgba(232,228,220,0.55);">Hi ${escapeHtml(name)}, you now have access to the following project on Axinfra:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">
      ${credential('Project', projectName)}
      ${credential('Your role', roleLabel[role] ?? role)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:10px 0 0;">
      Log in to view milestones, evidence, and your tasks on this project.
    </p>

    ${btn('Open Project', projectUrl)}
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: `You've been added to "${projectName}" on Axinfra`,
    html,
  });
}

export async function sendPhaseCreatedEmail(
  to: string,
  recipientName: string,
  projectName: string,
  phaseName: string,
  plannedStart: string | null,
  plannedEnd: string | null,
  projectId: string,
  actorName: string,
  actorRole: string,
) {
  const projectUrl = `${APP_URL}/projects/${projectId}/schedule`;
  const roleLabels: Record<string, string> = {
    CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor',
    CONSULTANT: 'Consultant', VIEWER: 'Viewer',
  };
  const actorLabel = roleLabels[actorRole] ?? actorRole;

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">New Phase Added</h1>
    <p style="margin:0 0 20px;font-size:13.5px;color:rgba(232,228,220,0.55);">
      Hi ${escapeHtml(recipientName)}, <strong style="color:#e8e4dc;">${escapeHtml(actorName)}</strong>
      (${escapeHtml(actorLabel)}) has added a new phase to
      <strong style="color:#e8e4dc;">${escapeHtml(projectName)}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:16px;">
      ${credential('Project', projectName)}
      ${credential('New Phase', phaseName)}
      ${credential('Planned Start', fmt(plannedStart))}
      ${credential('Planned End', fmt(plannedEnd))}
      ${credential('Added by', `${actorName} (${actorLabel})`)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:0 0 0;">
      Open the project schedule to see the updated phase timeline.
    </p>

    ${btn('View Schedule', projectUrl)}
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: `New phase "${phaseName}" added to ${projectName}`,
    html,
  });
}

export async function sendScheduleUpdatedEmail(
  to: string,
  recipientName: string,
  projectName: string,
  phaseName: string,
  newEndDate: string,
  projectId: string,
  actorName: string,
  actorRole: string,
  newStartDate?: string,
) {
  const projectUrl = `${APP_URL}/projects/${projectId}/schedule`;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const roleLabels: Record<string, string> = {
    CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor',
    CONSULTANT: 'Consultant', VIEWER: 'Viewer',
  };
  const actorLabel = roleLabels[actorRole] ?? actorRole;

  const changedFields: string[] = [];
  if (newStartDate) changedFields.push('start date');
  if (newEndDate)   changedFields.push('end date');
  const changeLabel = changedFields.join(' and ');

  const html = baseTemplate(`
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#e8e4dc;">Phase Schedule Updated</h1>
    <p style="margin:0 0 20px;font-size:13.5px;color:rgba(232,228,220,0.55);">
      Hi ${escapeHtml(recipientName)}, <strong style="color:#e8e4dc;">${escapeHtml(actorName)}</strong>
      (${escapeHtml(actorLabel)}) has updated the ${escapeHtml(changeLabel)} for a phase in
      <strong style="color:#e8e4dc;">${escapeHtml(projectName)}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:16px;">
      ${credential('Project', projectName)}
      ${credential('Phase', phaseName)}
      ${newStartDate ? credential('New Start Date', fmt(newStartDate)) : ''}
      ${newEndDate   ? credential('New End Date',   fmt(newEndDate))   : ''}
      ${credential('Changed by', `${actorName} (${actorLabel})`)}
    </table>

    <p style="font-size:12px;color:rgba(232,228,220,0.35);margin:0 0 0;">
      Open the project schedule to review the updated timeline and check your assigned milestones.
    </p>

    ${btn('View Schedule', projectUrl)}
  `);

  return getResend().emails.send({
    from: FROM,
    to,
    subject: `"${phaseName}" dates updated — ${projectName}`,
    html,
  });
}
