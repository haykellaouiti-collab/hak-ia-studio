import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://VOTRE_PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';

const configured = !SUPABASE_URL.includes('VOTRE_');
let supabase = null;

if (configured) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: true, persistSession: true }
    });
} else {
    console.warn('Supabase non configuré — mode invité uniquement.');
    window.HAK?.setPremium(false);
}

function setBadge(text, premium) {
    const b = document.getElementById('authStatus');
    b.textContent = text;
    b.classList.toggle('premium', premium);
}

async function refreshUser() {
    if (!supabase) {
        setBadge('Gratuit', false);
        document.getElementById('btnAuth').textContent = 'Connexion';
        document.getElementById('btnAuth').onclick = () => alert('Connexion non configurée. Ajoutez vos clés Supabase dans auth.js.');
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const btn = document.getElementById('btnAuth');

    if (!session) {
        setBadge('Gratuit', false);
        btn.textContent = 'Connexion';
        btn.onclick = () => openLogin();
        window.HAK?.setPremium(false);
        return;
    }

    const { data } = await supabase.from('subscriptions').select('status').eq('user_id', session.user.id).maybeSingle();
    const active = data?.status === 'active' || data?.status === 'trialing';
    window.HAK?.setPremium(active);
    setBadge(active ? 'Creator' : 'Gratuit', active);
    btn.textContent = session.user.email?.split('@')[0] || 'Mon compte';
    btn.onclick = async () => {
        if (confirm('Se déconnecter ?')) {
            await supabase.auth.signOut();
            refreshUser();
        }
    };
}

function openLogin() {
    document.getElementById('loginModal').classList.remove('hidden');
}
function closeLogin() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginMsg').innerHTML = '';
}

document.getElementById('closeLogin').onclick = closeLogin;
document.getElementById('loginModal').addEventListener('click', (e) => {
    if (e.target.id === 'loginModal') closeLogin();
});

document.getElementById('btnMagicLink').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const msg = document.getElementById('loginMsg');
    if (!email) { msg.innerHTML = '<div class="error-msg">Entrez un email.</div>'; return; }
    msg.innerHTML = '<div class="info-msg">Envoi en cours...</div>';
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    msg.innerHTML = error
        ? `<div class="error-msg">${error.message}</div>`
        : '<div class="success-msg">Lien envoyé ! Vérifiez votre boîte email.</div>';
};

document.getElementById('btnGoogle').onclick = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
};

if (supabase) {
    supabase.auth.onAuthStateChange(() => refreshUser());
}
refreshUser();