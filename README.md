# HAK IA Studio

Éditeur vidéo 100 % local (fusion, texte, audio), monétisé par abonnement à 10 $/mois.

## ⚠️ Avant de déployer — 3 points obligatoires

### 1. Renommer `_headers`

Le fichier doit s'appeler **`_headers`** (sans extension). S'il s'appelle `_headers.txt`, Cloudflare Pages l'ignore et le multi-thread est désactivé.

### 2. Ajouter une police

Créez un dossier `fonts/` et placez-y un fichier `Inter-Regular.ttf`.  
Téléchargez-le depuis Google Fonts → Inter → Regular → télécharger le `.ttf`.

Sans ce fichier, l'app tente un fallback depuis jsdelivr ; si échec, l'incrustation de texte est désactivée.

### 3. Configurer Supabase et Stripe

Voir les sections ci-dessous.

---

## Déploiement Cloudflare Pages

1. Poussez ce dépôt sur GitHub.
2. Cloudflare Dashboard → **Pages** → **Create a project** → connectez le dépôt.
3. Build command : *(vide)*. Output directory : `/`.
4. Déployez. Vérifiez dans la console navigateur :
   ```js
   crossOriginIsolated   // true
   typeof SharedArrayBuffer  // "function"
   ```

## Domaine personnalisé (obligatoire pour AdSense)

- Cloudflare Pages → **Custom domains** → ajoutez votre domaine.
- Pointez les DNS chez votre registraire vers Cloudflare.

## Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor** → exécutez :

```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  status text not null default 'inactive'
    check (status in ('inactive','active','trialing','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "read own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);
```

3. **Authentication → Providers** : activez Email et Google.
4. **Authentication → URL Configuration** : ajoutez `https://votredomaine.com` comme Redirect URL.
5. Copiez `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `auth.js` **et** `pricing.html`.

## Stripe

1. Créez un produit récurrent à **10 $/mois** dans Stripe.
2. Créez un **Payment Link** pour ce produit.
3. Remplacez `VOTRE_LIEN` dans `pricing.html`.

**Activation MVP (manuelle)** : après paiement, retrouvez l'utilisateur dans Supabase, passez son `status` à `'active'`. L'utilisateur actualise l'app et voit le badge Creator.

**Activation automatique (recommandée)** : ajoutez une fonction Edge Supabase `stripe-webhook` qui écoute `customer.subscription.created/updated/deleted` et met à jour la table `subscriptions`. Configurez le webhook Stripe vers son URL.

## Vérification finale

- [ ] `_headers` (sans extension) présent
- [ ] `fonts/Inter-Regular.ttf` présent
- [ ] Supabase configuré (URL + clé)
- [ ] Stripe Payment Link configuré
- [ ] `crossOriginIsolated === true` en console
- [ ] Connexion magic link fonctionne
- [ ] Fusion de 2 vidéos fonctionne
- [ ] Texte incrusté fonctionne
- [ ] Paiement Stripe test réussi
- [ ] Activation manuelle testée