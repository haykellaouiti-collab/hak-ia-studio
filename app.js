const { FFmpeg } = FFmpegWASM;
const { fetchFile, toBlobURL } = FFmpegUtil;

let ffmpeg = null;
let loadPromise = null;
let currentBlobUrl = null;
let isPremium = false;
let fontLoaded = false;
let audioCheckActive = false;
let audioDetected = false;

const $ = (id) => document.getElementById(id);
const logBox = $('logBox');

function log(msg) {
    logBox.textContent += `\n> ${msg}`;
    logBox.scrollTop = logBox.scrollHeight;
}

function setProgress(pct) {
    $('progressWrap').classList.remove('hidden');
    $('progressBar').value = pct;
    $('progressLabel').textContent = `${pct}%`;
}

function hideProgress() {
    $('progressWrap').classList.add('hidden');
}

// --- Chargement FFmpeg (promesse partagée, multi-thread si COEP actif) ---
async function loadFFmpeg() {
    if (ffmpeg) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        log('Chargement de FFmpeg (~30 Mo, cache navigateur ensuite)...');
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            if (audioCheckActive && message.includes('Audio:')) audioDetected = true;
            console.log(message);
        });
        ffmpeg.on('progress', ({ progress }) => setProgress(Math.round(progress * 100)));

        const isolated = typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated;
        const pkg = isolated ? '@ffmpeg/core-mt@0.12.6' : '@ffmpeg/core@0.12.6';
        const baseURL = `https://unpkg.com/${pkg}/dist/umd`;
        log(isolated ? '✅ Mode multi-thread actif.' : '⚠️ Mode mono-thread (COEP absent).');

        const loadOpts = {
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        };
        if (isolated) {
            loadOpts.workerURL = await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript');
        }
        await ffmpeg.load(loadOpts);

        // Police : local d'abord, CDN en secours
        const fontSources = [
            'fonts/Inter-Regular.ttf',
            'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
        ];
        for (const src of fontSources) {
            try {
                const r = await fetch(src, { mode: 'cors' });
                if (r.ok) {
                    await ffmpeg.writeFile('font.ttf', new Uint8Array(await r.arrayBuffer()));
                    fontLoaded = true;
                    log('✅ Police chargée.');
                    break;
                }
            } catch (e) { /* suivant */ }
        }
        if (!fontLoaded) log('⚠️ Police indisponible : l\'incrustation de texte sera ignorée.');

        log('✅ FFmpeg prêt.');
    })();

    try { await loadPromise; }
    catch (e) { ffmpeg = null; loadPromise = null; throw e; }
}

// --- Utilitaires premium ---
function enforceFileLimit(files) {
    if (!isPremium && files.length > 2) {
        throw new Error('Plan gratuit : 2 vidéos maximum. Passez à Creator pour des fusions illimitées.');
    }
}

function getQualityFilter() {
    return isPremium ? null : 'scale=-2:720';
}

function getWatermarkFilter() {
    if (isPremium || !fontLoaded) return null;
    return `drawtext=fontfile=font.ttf:text='HAK IA':fontcolor=white@0.55:fontsize=22:x=w-tw-20:y=20`;
}

function checkDailyLimit() {
    if (isPremium) return;
    const today = new Date().toDateString();
    const last = localStorage.getItem('lastExportDate');
    const count = last === today ? parseInt(localStorage.getItem('exportsToday') || '0', 10) : 0;
    if (count >= 1) {
        throw new Error('Plan gratuit : 1 export par jour. Passez à Creator pour exporter sans limite.');
    }
}

function recordExport() {
    const today = new Date().toDateString();
    const last = localStorage.getItem('lastExportDate');
    const count = last === today ? parseInt(localStorage.getItem('exportsToday') || '0', 10) : 0;
    localStorage.setItem('lastExportDate', today);
    localStorage.setItem('exportsToday', String(count + 1));
}

function cleanupBlobUrl() {
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
}

function showResult(containerId, message, blob, filename) {
    cleanupBlobUrl();
    currentBlobUrl = URL.createObjectURL(blob);
    $(containerId).innerHTML = `
        <div class="success-msg">${message}</div>
        <a href="${currentBlobUrl}" download="${filename}" class="download-link">⬇️ Télécharger</a>`;
    $('previewArea').innerHTML = `<video src="${currentBlobUrl}" controls></video>`;
    recordExport();
}

// --- FUSION ---
async function processFusion() {
    const btn = $('btnFusion');
    btn.disabled = true;
    $('result-fusion').innerHTML = '';

    try {
        await loadFFmpeg();
        const files = $('vidFiles').files;
        if (files.length < 2) throw new Error('Sélectionnez au moins 2 vidéos.');
        enforceFileLimit(files);
        checkDailyLimit();

        const inputs = [];
        for (let i = 0; i < files.length; i++) {
            const ext = files[i].name.split('.').pop().toLowerCase();
            const name = `input${i}.${ext}`;
            await ffmpeg.writeFile(name, await fetchFile(files[i]));
            inputs.push(name);
        }
        await ffmpeg.writeFile('list.txt', inputs.map(n => `file '${n}'`).join('\n'));

        // Filtres qualité + filigrane
        const filters = [getQualityFilter(), getWatermarkFilter()].filter(Boolean);
        const cmd = [
            '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart', 'output.mp4'
        ];
        if (filters.length) cmd.splice(6, 0, '-vf', filters.join(','));

        log('Fusion et ré-encodage en cours...');
        await ffmpeg.exec(cmd);

        const data = await ffmpeg.readFile('output.mp4');
        showResult('result-fusion', 'Fusion terminée.', new Blob([data], { type: 'video/mp4' }), 'fusion.mp4');

        for (const n of inputs) await ffmpeg.deleteFile(n);
        await ffmpeg.deleteFile('list.txt');
        await ffmpeg.deleteFile('output.mp4');
    } catch (e) {
        log(`❌ ${e.message}`);
        $('result-fusion').innerHTML = `<div class="error-msg">${e.message}</div>`;
    } finally {
        btn.disabled = false;
        hideProgress();
    }
}

// --- TEXTE & AUDIO ---
async function processMix() {
    const btn = $('btnMix');
    btn.disabled = true;
    $('result-mix').innerHTML = '';

    try {
        await loadFFmpeg();
        const vid = $('vidTarget').files[0];
        const audio = $('audioTarget').files[0];
        let text = $('overlayText').value.trim();
        const pos = $('textPos').value;

        if (!vid) throw new Error('Sélectionnez une vidéo cible.');
        if (!audio && !text) throw new Error('Ajoutez un texte ou un fichier audio.');
        checkDailyLimit();
        if (text && !fontLoaded) {
            log('⚠️ Police manquante, texte ignoré.');
            text = '';
        }

        const vidExt = vid.name.split('.').pop().toLowerCase();
        const vidName = `vid.${vidExt}`;
        await ffmpeg.writeFile(vidName, await fetchFile(vid));

        // Détection audio
        audioCheckActive = true;
        audioDetected = false;
        try { await ffmpeg.exec(['-i', vidName]); } catch (_) { /* attendu */ }
        audioCheckActive = false;
        log(audioDetected ? 'Piste audio détectée.' : 'Aucune piste audio dans la vidéo.');

        let audName = null;
        if (audio) {
            const audExt = audio.name.split('.').pop().toLowerCase();
            audName = `aud.${audExt}`;
            await ffmpeg.writeFile(audName, await fetchFile(audio));
        }

        // Filtres vidéo
        const vFilters = [];
        const q = getQualityFilter(); if (q) vFilters.push(q);
        if (text) {
            await ffmpeg.writeFile('overlay.txt', new TextEncoder().encode(text));
            let y = "h-100";
            if (pos === 'top') y = "50";
            if (pos === 'center') y = "(h-text_h)/2";
            vFilters.push(`drawtext=fontfile=font.ttf:textfile=overlay.txt:fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.5:boxborderw=10`);
        }
        const wm = getWatermarkFilter(); if (wm) vFilters.push(wm);

        // Construction de la commande
        const buildCmd = (mixAudio) => {
            const c = ['-y', '-i', vidName];
            if (audio) c.push('-i', audName);
            if (vFilters.length) c.push('-vf', vFilters.join(','));
            c.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');

            if (audio && audioDetected && mixAudio) {
                c.push('-filter_complex', '[0:a]volume=1.0[orig];[1:a]volume=0.35[bgm];[orig][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]');
                c.push('-map', '0:v:0', '-map', '[aout]');
                c.push('-c:a', 'aac', '-b:a', '192k');
            } else if (audio) {
                c.push('-map', '0:v:0', '-map', '1:a:0');
                c.push('-c:a', 'aac', '-b:a', '192k');
            } else {
                c.push('-map', '0:v:0', '-map', '0:a?', '-c:a', 'copy');
            }
            c.push('-movflags', '+faststart', 'output_mix.mp4');
            return c;
        };

        log('Traitement en cours...');
        try {
            await ffmpeg.exec(buildCmd(true));
        } catch (e) {
            if (audio && audioDetected) {
                log('Mélange audio impossible, remplacement de la piste...');
                await ffmpeg.exec(buildCmd(false));
            } else throw e;
        }

        const data = await ffmpeg.readFile('output_mix.mp4');
        showResult('result-mix', 'Traitement terminé.', new Blob([data], { type: 'video/mp4' }), 'mix.mp4');

        await ffmpeg.deleteFile(vidName);
        if (audName) await ffmpeg.deleteFile(audName);
        if (text) await ffmpeg.deleteFile('overlay.txt');
        await ffmpeg.deleteFile('output_mix.mp4');
    } catch (e) {
        log(`❌ ${e.message}`);
        $('result-mix').innerHTML = `<div class="error-msg">${e.message}</div>`;
    } finally {
        btn.disabled = false;
        hideProgress();
    }
}

// --- Onglets ---
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('tab-fusion').classList.toggle('hidden', btn.dataset.tab !== 'fusion');
        $('tab-mix').classList.toggle('hidden', btn.dataset.tab !== 'mix');
    });
});

$('btnFusion').addEventListener('click', processFusion);
$('btnMix').addEventListener('click', processMix);

// --- API publique pour auth.js ---
window.HAK = {
    setPremium: (val) => {
        isPremium = !!val;
        $('watermarkNotice').classList.toggle('hidden', isPremium);
        $('limitFusion').textContent = isPremium ? '(illimité)' : '(2 max en gratuit)';
    }
};