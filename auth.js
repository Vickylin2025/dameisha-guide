import { supabase } from './supabase.js';

async function submitAuthForm(form, action) {
  const message = form.querySelector('.auth-message');
  const button = form.querySelector('button[type="submit"]');
  message.textContent = '';
  message.classList.remove('success');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    const result = await action(values);
    if (result.error) throw result.error;
    message.textContent = result.message || '操作成功';
    message.classList.add('success');
    if (result.redirect) window.location.assign(result.redirect);
  } catch (error) {
    message.textContent = error.message;
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      form.querySelector('#resendConfirmation')?.removeAttribute('hidden');
    }
  } finally {
    button.disabled = false;
  }
}

const registerForm = document.querySelector('#registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    const password = registerForm.elements.password.value;
    const confirmation = registerForm.elements.confirmPassword.value;
    if (password !== confirmation) {
      registerForm.querySelector('.auth-message').textContent = '两次输入的密码不一致';
      return;
    }
    submitAuthForm(registerForm, async values => {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { username: values.username.trim() } }
      });
      if (error) return { error };
      if (!data.session) return { message: '注册成功，请查收验证邮件并完成邮箱验证后再登录。' };
      return { message: '注册成功', redirect: '/profile.html' };
    });
  });
}

const loginForm = document.querySelector('#loginForm');
if (loginForm) loginForm.addEventListener('submit', event => {
  event.preventDefault();
  submitAuthForm(loginForm, async values => {
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
    return error ? { error } : { message: '登录成功', redirect: '/profile.html' };
  });
});

const resendConfirmation = document.querySelector('#resendConfirmation');
if (resendConfirmation && loginForm) resendConfirmation.addEventListener('click', async () => {
  const emailInput = loginForm.elements.email;
  if (!emailInput.reportValidity()) return;
  const message = loginForm.querySelector('.auth-message');
  resendConfirmation.disabled = true;
  message.textContent = '';
  message.classList.remove('success');
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: emailInput.value.trim(),
      options: { emailRedirectTo: `${window.location.origin}/login.html?verified=1` }
    });
    if (error) throw error;
    message.textContent = '验证邮件已重新发送，请打开最新邮件中的链接。';
    message.classList.add('success');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    resendConfirmation.disabled = false;
  }
});

const profileName = document.querySelector('#profileName');
if (profileName) {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) return window.location.replace('/login.html');
    profileName.textContent = data.session.user.user_metadata.username || data.session.user.email;
  }).catch(() => window.location.replace('/login.html'));
}

const logoutButton = document.querySelector('#logoutButton');
if (logoutButton) logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.assign('/login.html?message=已退出登录');
  } catch (error) {
    logoutButton.disabled = false;
    const message = document.querySelector('.profile-intro');
    message.textContent = `退出失败：${error.message}`;
  } finally {
    if (logoutButton.disabled) logoutButton.disabled = false;
  }
});

const authLink = document.querySelector('#authLink');
if (authLink) {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      authLink.href = '/profile.html';
      authLink.textContent = '个人中心';
    }
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    authLink.href = session ? '/profile.html' : '/login.html';
    authLink.textContent = session ? '个人中心' : '登录';
  });
}

const queryMessage = new URLSearchParams(window.location.search).get('message');
const loginMessage = document.querySelector('#loginMessage');
if (queryMessage && loginMessage) {
  loginMessage.textContent = queryMessage;
  loginMessage.classList.add('success');
}
if (new URLSearchParams(window.location.search).get('verified') === '1' && loginMessage) {
  loginMessage.textContent = '邮箱验证完成，现在可以登录。';
  loginMessage.classList.add('success');
}
