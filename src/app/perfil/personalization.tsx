'use client';
import { useState } from 'react';
import ImageUpload from '@/components/image-upload';
import { Button } from '@/components/ui/button';

export default function Personalization({ avatarUrl, logoUrl, imageUrl, minutes, canManage }: { avatarUrl: string; logoUrl: string; imageUrl: string; minutes: number; canManage: boolean }) {
  const [avatar, setAvatar] = useState(avatarUrl), [logo, setLogo] = useState(logoUrl), [banner, setBanner] = useState(imageUrl);
  const [timer, setTimer] = useState(minutes);
  const [busy, setBusy] = useState(false), [avatarBusy, setAvatarBusy] = useState(false), [logoBusy, setLogoBusy] = useState(false), [bannerBusy, setBannerBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(kind: 'images' | 'screensaver') {
    setBusy(true); setMessage('');
    const changes = { ...(avatar !== avatarUrl ? { avatarUrl: avatar } : {}), ...(canManage && logo !== logoUrl ? { logoUrl: logo } : {}) };
    try {
      if (kind === 'images' && !Object.keys(changes).length) { setMessage('Nenhuma alteração nas imagens.'); return; }
      const response = await fetch(`/api/settings/${kind === 'images' ? 'personalization' : 'screensaver'}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'images' ? changes : { imageUrl: banner, minutes: timer }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Falha ao salvar.');
      if (kind === 'images') window.dispatchEvent(new Event('montante:brand-updated'));
      setMessage(kind === 'images' ? 'Imagens salvas.' : 'Proteção de tela salva. O PDV aberto recebe a configuração em até um minuto.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }
  return <><section className="space-y-5 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Personalização</h2><div className="grid gap-6 sm:grid-cols-2"><ImageUpload label="Foto do perfil" purpose="avatar" value={avatar} onChange={setAvatar} disabled={busy} onBusyChange={setAvatarBusy} />{canManage && <ImageUpload label="Logo da loja" purpose="logo" value={logo} onChange={setLogo} disabled={busy} onBusyChange={setLogoBusy} />}</div><Button disabled={busy || avatarBusy || logoBusy} onClick={() => void save('images')}>Salvar imagens</Button></section>{canManage && <section className="space-y-5 rounded-xl border bg-white p-5"><div><h2 className="text-lg font-semibold">Proteção de Tela</h2><p className="mt-1 text-sm text-slate-600">Exiba um banner quando o PDV estiver sem uso. Um clique ou tecla retorna à venda sem perder os dados.</p></div><ImageUpload label="Imagem da proteção de tela" purpose="screensaver" value={banner} onChange={setBanner} disabled={busy} onBusyChange={setBannerBusy} /><p className="text-sm text-slate-500">Tamanho recomendado: 1200×800 pixels (proporção 3:2 ou tela cheia), em PNG ou JPG. A imagem será exibida inteira, sem distorção, sobre fundo escuro.</p><label className="block max-w-xs text-sm font-medium">Ativar após<select value={timer} disabled={busy} onChange={event => setTimer(Number(event.target.value))} className="mt-2 block w-full rounded-lg border p-2.5">{[0, 2, 5, 10, 15, 30].map(value => <option key={value} value={value}>{value ? `${value} minutos sem atividade` : 'Desativada'}</option>)}</select></label><Button disabled={busy || bannerBusy || (timer > 0 && !banner)} onClick={() => void save('screensaver')}>Salvar proteção de tela</Button><p className="text-xs text-slate-500">A proteção de tela é visual; não encerra a sessão nem substitui o bloqueio do dispositivo.</p></section>}{message && <p role="status" className="rounded-lg border bg-orange-50 p-3 text-sm">{message}</p>}</>;
}
