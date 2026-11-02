import { useCallback, useEffect, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { supabase } from '../../../../shared/supabase';
import type { PageDuConseil } from '../../../../shared/conseil-du-matin-pur';
import './conseil-du-matin.css';

/* LE CONSEIL DU MATIN, À L'ÉCRAN · 2 novembre 2026 (le socle de la Maison
   intelligente). Saphir écrit la page à 7 h (fonction `conseil-du-matin`) ;
   ce bloc la lit dans `conseil_du_matin` (lecture des souverains, RLS 0151) :
   la page du jour, à défaut la dernière. « Écrire maintenant » la réécrit
   sans rien notifier. Préfixe `cdm-`. Rien ici ne nomme une cliente : la
   page n'en porte pas. */

const FONCTION = 'conseil-du-matin';

type Lue = { jour: string; page: PageDuConseil };

async function litLaDernierePage(): Promise<{ lue: Lue | null; absente: boolean }> {
  if (!supabase) return { lue: null, absente: false };
  const { data, error } = await supabase.from('conseil_du_matin').select('jour, page').order('jour', { ascending: false }).limit(1);
  if (error) return { lue: null, absente: /does not exist|schema cache|not find the table/i.test(error.message ?? '') };
  const l = ((data ?? []) as { jour: string; page: PageDuConseil }[])[0];
  return { lue: l && l.page ? { jour: l.jour, page: l.page } : null, absente: false };
}

const jourDeCotonou = (): string => new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10);

export default function ConseilDuMatin() {
  const [lue, setLue] = useState<Lue | null>(null);
  const [absente, setAbsente] = useState(false);
  const [charge, setCharge] = useState(true);
  const [ecrit, setEcrit] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  const relis = useCallback(async () => {
    const r = await litLaDernierePage();
    setLue(r.lue); setAbsente(r.absente); setCharge(false);
  }, []);
  useEffect(() => { void relis(); }, [relis]);

  const ecrisMaintenant = async () => {
    if (!supabase || ecrit) return;
    setEcrit(true);
    try {
      const { data, error } = await supabase.functions.invoke(FONCTION, { body: { source: 'ecran' } });
      const r = (data ?? null) as { ok?: boolean } | null;
      if (error || !r?.ok) toast('Saphir n’a pas pu écrire la page. Réessayez dans un instant.');
      else toast('La page du matin est réécrite.');
    } catch {
      toast('Saphir n’a pas pu écrire la page. Réessayez dans un instant.');
    } finally {
      setEcrit(false);
      await relis();
    }
  };

  if (charge) return <section className="cdm" aria-label="Le Conseil du matin"><p className="cdm-doux">Le Conseil du matin se lit…</p></section>;
  if (absente) {
    return (
      <section className="cdm" aria-label="Le Conseil du matin">
        <p className="cdm-sur">Saphir · le Conseil du matin</p>
        <p className="cdm-doux">La table du Conseil n’est pas encore posée en base (migration 0151).</p>
      </section>
    );
  }
  const p = lue?.page ?? null;
  const duJour = !!lue && lue.jour === jourDeCotonou();
  return (
    <section className="cdm" aria-label="Le Conseil du matin">
      <div className="cdm-tete">
        <div>
          <p className="cdm-sur">Saphir · le Conseil du matin</p>
          <h2 className="cdm-titre">{p ? p.jourDit : 'Pas encore de page'}</h2>
          {p && !duJour && <p className="cdm-doux">La page de ce matin n’est pas encore écrite : voici la dernière.</p>}
        </div>
        <Button size="sm" variant="ghost" disabled={ecrit} onClick={() => { void ecrisMaintenant(); }}>{ecrit ? 'Saphir écrit…' : 'Écrire maintenant'}</Button>
      </div>

      {!p && <p className="cdm-doux">Saphir écrit chaque matin à 7 h. Pour une première page tout de suite : « Écrire maintenant ».</p>}

      {p && (
        <>
          <div className="cdm-bloc">
            <p className="cdm-rubrique">Ce qui presse</p>
            {p.presse.length === 0
              ? <p className="cdm-calme">Rien ne presse ce matin.</p>
              : <ul className="cdm-liste">{p.presse.map((l, i) => <li key={i} className={`cdm-point est-${l.ton}`}>{l.texte}</li>)}</ul>}
          </div>
          {p.revue && <p className="cdm-revue">{p.revue}</p>}
          {p.lundi && <p className="cdm-lundi">{p.lundi.dit}</p>}

          <button type="button" className="cdm-replie" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
            {ouvert ? 'Replier la page' : 'Hier, aujourd’hui, les dix, les crédits'}
          </button>
          {ouvert && (
            <div className="cdm-suite">
              <div className="cdm-bloc">
                <p className="cdm-rubrique">Hier</p>
                {p.hier.map((t, i) => <p key={i} className="cdm-ligne">{t}</p>)}
              </div>
              <div className="cdm-bloc">
                <p className="cdm-rubrique">Aujourd’hui</p>
                {p.aujourdhui.map((t, i) => <p key={i} className="cdm-ligne">{t}</p>)}
              </div>
              <div className="cdm-bloc">
                <p className="cdm-rubrique">Les dix</p>
                <ul className="cdm-dix">
                  {p.dix.map((d) => (
                    <li key={d.id} className={`cdm-pro est-${d.ton}`}>
                      <span className="cdm-pro__nom">{d.nom}</span>
                      <span className="cdm-pro__qui">{d.tient} · {d.porteurs}</span>
                      <span className="cdm-pro__dit">{d.dit}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="cdm-bloc">
                <p className="cdm-rubrique">Les crédits</p>
                <p className="cdm-ligne">{p.credits.dit}</p>
                {p.credits.alertes.map((t, i) => <p key={i} className="cdm-ligne est-attention">{t}</p>)}
              </div>
            </div>
          )}
          <p className="cdm-doux cdm-pied">Écrite à {new Date(p.ecritLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo' })}, sans nom de cliente.</p>
        </>
      )}
    </section>
  );
}
