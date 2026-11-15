import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://VOTRE_PROJET.supabase.co'; // À remplacer
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY'; // À remplacer

const configured = !SUPABASE_URL.includes('VOTRE_');
let supabase = null;
if (configured) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: true, persistSession: true }
    });
}

function setBadge(text, premium) {
    const b = document.getElementById('authStatus');
    if (b) { b.textContent = text; b.classList.toggle('premium', premium); }
}

// Fonctions globales manquantes
window.openLogin = function() {
    document.getElementById('loginModal').classList.add('open');
};
window.closeLogin = function() {
    document.getElementById('loginModal').classList.remove('open');
    document.getElementById('loginMsg').innerHTML = '';
};

window.loginMagicLink = async function() {
    const email = document.getElementById('loginEmail').value.trim();
    const msg = document.getElementById('loginMsg');
    if (!email) { msg.innerHTML = '<div class="error-msg">Entrez un email.</div>'; return; }
    msg.innerHTML = '<div class="info-msg">Envoi en cours...</div>';
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    msg.innerHTML = error ? `<div class="error-msg">${error.message}</div>` : '<div class="success-msg">Lien envoyé ! Vérifiez votre boîte email.</div>';
};

window.loginGoogle = async function() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
};

async function refreshUser() {
    if (!supabase) {
        setBadge('Gratuit', false);
        const btn = document.getElementById('btnAuth');
        if (btn) { btn.textContent = 'Connexion'; btn.onclick = () => alert('Connexion non configurée.'); }
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const btn = document.getElementById('btnAuth');

    if (!session) {
        setBadge('Gratuit', false);
        if (btn) { btn.textContent = 'Connexion'; btn.onclick = window.openLogin; }
        window.HAK?.setPremium(false);
        return;
    }

    const { data } = await supabase.from('subscriptions').select('status').eq('user_id', session.user.id).maybeSingle();
    const active = data?.status === 'active' || data?.status === 'trialing';
    window.HAK?.setPremium(active);
    setBadge(active ? 'Creator' : 'Gratuit', active);
    if (btn) {
        btn.textContent = session.user.email?.split('@')[0] || 'Mon compte';
        btn.onclick = async () => { await supabase.auth.signOut(); refreshUser(); };
    }
}

if (supabase) supabase.auth.onAuthStateChange(() => refreshUser());
refreshUser();