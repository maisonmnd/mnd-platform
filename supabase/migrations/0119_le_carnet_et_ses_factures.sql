-- ═══════════════════════════════════════════════════════════════════
-- 0119 — LE CARNET ET SES FACTURES S'ACCORDENT · 7 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc :
-- tout passe, ou rien ne change (leçon du 0118 : l'éditeur valide chaque
-- instruction à part, seul un bloc `do` tient ensemble).
--
-- Les décisions viennent de la page à cocher (artefact KP2pDE6N…), sur
-- les propositions telles qu'elles étaient : « construis », 7 oct. Les cas
-- « On en parle » et « Laisser » ne sont pas touchés. Les factures à
-- supprimer ne le sont PAS ici : la suppression du Trône rembobine l'avoir,
-- le stock, l'abonnement et les pourboires ; elle se fait à la main.
--
-- Chaque geste porte sa GARDE : il ne s'applique que si l'état trouvé est
-- celui que la vérification a vu (sinon il est sauté et compté). Aucun
-- rendez-vous confirmé à venir n'est écrit (le balayage des confirmations
-- ne doit rien voir) ; les deux rendez-vous remis entrent sans pose neuve.
-- Passer en honoré ne change QUE le statut : ni points, ni stock, ni
-- reprise, pour des rituels déjà anciens.
--
-- RETOUR EN ARRIÈRE : repli_0119_appointments et repli_0119_invoices.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.repli_0119_appointments (like public.appointments including all);
alter table public.repli_0119_appointments enable row level security;
create table if not exists public.repli_0119_invoices (like public.invoices including all);
alter table public.repli_0119_invoices enable row level security;
create table if not exists public.repli_0119_compte_rendu (
  fait_le timestamptz not null default now(),
  compte_rendu jsonb not null
);
alter table public.repli_0119_compte_rendu enable row level security;

do $bloc$
declare
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  d record;
  n int;
  num text;
  fait jsonb := '{}'::jsonb;
  saute jsonb := '[]'::jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into public.repli_0119_appointments select * from public.appointments
  where not exists (select 1 from public.repli_0119_appointments);
  insert into public.repli_0119_invoices select * from public.invoices
  where not exists (select 1 from public.repli_0119_invoices);

  drop table if exists pg_temp.decisions;
  create temp table decisions (op text, rdv text, fac text, montant numeric, cle text);
  insert into decisions values
    ('vers_facture', 'H37CbcZGLhDchcXiPg7d', 'inv-lxdyqe0513', 30000, 'c-inv-lxdyqe0513'),
    ('vers_rdv', 'hUUgoLLz1zvPKig67FcP', 'inv-rep-hUUgoLLz1zvPKig67FcP', null, 'd1-inv-rep-hUUgoLLz1zvPKig67FcP'),
    ('vers_rdv', 'xvCnZHdHmOoNBrPfFinQ', 'inv-rep-xvCnZHdHmOoNBrPfFinQ', null, 'd1-inv-rep-xvCnZHdHmOoNBrPfFinQ'),
    ('vers_rdv', 'f96wwuqcct', 'inv-1o86afrema', null, 'd2-inv-1o86afrema'),
    ('vers_rdv', '2un6y19gyb', 'inv-eawdg9dqvy', null, 'd2-inv-eawdg9dqvy'),
    ('vers_rdv', 'ap-9fp1h3ksai', 'inv-fzc4gnksaq', null, 'd2-inv-fzc4gnksaq'),
    ('vers_facture', 'I3A8WDK0cISrBb5La7uI', 'inv-rep-I3A8WDK0cISrBb5La7uI', 360000, 'c-inv-rep-I3A8WDK0cISrBb5La7uI'),
    ('vers_facture', 'VxanK0WK49dfrd3gN83q', 'inv-rep-VxanK0WK49dfrd3gN83q', 45000, 'c-inv-rep-VxanK0WK49dfrd3gN83q'),
    ('vers_rdv', 'ap-z19pd5zphv', 'inv-28tg35fkvf', null, 'd2-inv-28tg35fkvf'),
    ('vers_rdv', 'ap-12hhjczphv', 'inv-184pzvk9dw', null, 'd2-inv-184pzvk9dw'),
    ('retire_double', '8898jgx81k', 'inv-10sfx3xj7u', 20000, 'd3-inv-10sfx3xj7u'),
    ('vers_facture', 'jxkpe70uoe', 'inv-6inyjgzaqx', 25000, 'c-inv-6inyjgzaqx'),
    ('retire_double', 'ap-ruwm8qtxno', 'inv-vpmvvsq5jy', 25000, 'd3-inv-vpmvvsq5jy'),
    ('vers_rdv', 'hjp2zbsqwi', 'inv-k6lbaztav1', null, 'd2-inv-k6lbaztav1'),
    ('vers_rdv', 'RmRWXvUXZJ2ABkFOs7jF', 'inv-rep-RmRWXvUXZJ2ABkFOs7jF', null, 'd1-inv-rep-RmRWXvUXZJ2ABkFOs7jF'),
    ('vers_facture', '6pbihqtcj3UigIIVZNLT', 'inv-rep-6pbihqtcj3UigIIVZNLT', 420000, 'c-inv-rep-6pbihqtcj3UigIIVZNLT'),
    ('vers_rdv', 'exdlo7oa0y', 'inv-tszmnxu0io', null, 'd2-inv-tszmnxu0io'),
    ('vers_facture', 'ofcrl1i1px', 'inv-bzjxiwtbhw', 15000, 'c-inv-bzjxiwtbhw'),
    ('vers_facture', 'LTg419wBFw5KWaGboGtU', 'inv-rep-LTg419wBFw5KWaGboGtU', 25000, 'c-inv-rep-LTg419wBFw5KWaGboGtU'),
    ('vers_facture', 'xxilaeftmz', 'inv-gw71v2smi0', 7500, 'c-inv-gw71v2smi0'),
    ('vers_rdv', 'p91qdyo5hg', 'inv-20grb1rl6s', null, 'd2-inv-20grb1rl6s'),
    ('vers_facture', '9AmvLtF9kUyJlNtpdpwt', 'inv-rep-9AmvLtF9kUyJlNtpdpwt', 250000, 'c-inv-rep-9AmvLtF9kUyJlNtpdpwt'),
    ('vers_facture', 'gFHFz9Nsxhg5WAn2E1Qi', 'inv-rep-gFHFz9Nsxhg5WAn2E1Qi', 15000, 'c-inv-rep-gFHFz9Nsxhg5WAn2E1Qi'),
    ('vers_rdv', 'waimdyte2s', 'inv-fk3pjtyfub', null, 'd2-inv-fk3pjtyfub'),
    ('vers_facture', 'v7o2wh9u7k', 'inv-jfg4fes1fw', 7500, 'c-inv-jfg4fes1fw'),
    ('vers_facture', 'OJe2GbGpsUujZ7D8naof', 'inv-3gwymnjcw3', 35000, 'c-inv-3gwymnjcw3'),
    ('vers_rdv', 'ytdgu62lca', 'inv-mklcsa3bdc', null, 'd2-inv-mklcsa3bdc'),
    ('vers_rdv', 'g6c8ingo6o', 'inv-n883ymixb7', null, 'd2-inv-n883ymixb7'),
    ('vers_facture', '81a73ip3e4', 'inv-x814yaiz0r', 50700, 'c-inv-x814yaiz0r'),
    ('vers_rdv', 'ckh8w6xi9q', 'inv-jzt6f1y2ak', null, 'd2-inv-jzt6f1y2ak'),
    ('vers_rdv', 'eus29s9799', 'inv-vyd759a99t', null, 'd2-inv-vyd759a99t'),
    ('vers_facture', 'tze2gc0m6e', 'inv-bliupwy0nf', 35000, 'c-inv-bliupwy0nf'),
    ('vers_facture', 'JXkVmCd4rgCD2kK4dz8x', 'inv-rep-JXkVmCd4rgCD2kK4dz8x', 30000, 'c-inv-rep-JXkVmCd4rgCD2kK4dz8x'),
    ('vers_rdv', 'ng4buxmcnm', 'inv-819irincgn', null, 'd2-inv-819irincgn'),
    ('detail_facture', 'hn9v75dns1', 'inv-da78ngbib6', null, 'mix-inv-da78ngbib6'),
    ('vers_facture', 'U6lS6PP153oE7PVSUD7W', 'inv-rep-U6lS6PP153oE7PVSUD7W', 494000, 'c-inv-rep-U6lS6PP153oE7PVSUD7W'),
    ('vers_rdv', 'g97xqzefzd', 'inv-1b4108frnp', null, 'd2-inv-1b4108frnp'),
    ('vers_rdv', 'hrf1sl3ihl', 'inv-2qwh514mkb', null, 'd2-inv-2qwh514mkb'),
    ('vers_facture', 'mqjixx5b9l', 'inv-3icsa5u52w', 80000, 'c-inv-3icsa5u52w'),
    ('vers_rdv', '7rb645yr8h', 'inv-r18satbcu7', null, 'd2-inv-r18satbcu7'),
    ('vers_rdv', 'ac4ox3ww40', 'inv-gtqy3zykqb', null, 'd2-inv-gtqy3zykqb'),
    ('retire_double', 'cmqog5h4lx', 'inv-v0wgp9hwng', 100000, 'd3-inv-v0wgp9hwng'),
    ('vers_facture', 'BICSGbs47XJ5pqQI8sRD', 'inv-rep-BICSGbs47XJ5pqQI8sRD', 185000, 'c-inv-rep-BICSGbs47XJ5pqQI8sRD'),
    ('vers_facture', 'oyummzxfd8', 'inv-0oqsw5jimc', 50000, 'c-inv-0oqsw5jimc'),
    ('vers_rdv', 'ekx9q6okej', 'inv-p502wxp6wn', null, 'd2-inv-p502wxp6wn'),
    ('vers_rdv', '2yqegq150w', 'inv-p6n4n1298c', null, 'd2-inv-p6n4n1298c'),
    ('vers_rdv', 'ap-kff5uxu01c', 'inv-z8nd48hurs', null, 'd2-inv-z8nd48hurs'),
    ('vers_rdv', 'ap-q8iwus4yup', 'inv-dgpdsa0f6s', null, 'd2-inv-dgpdsa0f6s'),
    ('vers_rdv', 'ap-qipnjozscr', 'inv-fe1utzto5d', null, 'd2-inv-fe1utzto5d'),
    ('vers_rdv', 'ojm3x18hr6', 'inv-coaf9hjozu', null, 'd2-inv-coaf9hjozu'),
    ('vers_rdv', 'jo769t7xsv', 'inv-3adwag8kgu', null, 'd2-inv-3adwag8kgu'),
    ('vers_rdv', 'h0b1sucepf', 'inv-qas1qidwnm', null, 'd2-inv-qas1qidwnm'),
    ('vers_rdv', 'BeaDfiMCDQZVoN92iaOs', 'inv-rep-BeaDfiMCDQZVoN92iaOs', null, 'd1-inv-rep-BeaDfiMCDQZVoN92iaOs'),
    ('vers_facture', 'pmb9jxbsc1', 'inv-6csv12byt6', 10000, 'c-inv-6csv12byt6'),
    ('vers_rdv', 'l8pxcw0arz', 'inv-gj43zu2bsg', null, 'd2-inv-gj43zu2bsg'),
    ('vers_rdv', 'ap-epwoebb0pa', 'inv-trhj49j61l', null, 'd2-inv-trhj49j61l'),
    ('vers_rdv', 'ap-flztnaovmx', 'inv-zr3xt63sth', null, 'd2-inv-zr3xt63sth'),
    ('vers_rdv', 'rmif0eifn0', 'inv-uklm1mj5ep', null, 'd2-inv-uklm1mj5ep'),
    ('vers_rdv', 'ypgn4scray', 'inv-gszu1sdu03', null, 'd2-inv-gszu1sdu03'),
    ('vers_rdv', 'ms1vasc0pa', 'inv-t822ovfcnu', null, 'd2-inv-t822ovfcnu'),
    ('vers_rdv', 'm49b8uoue5', 'inv-idzj2ursou', null, 'd2-inv-idzj2ursou'),
    ('vers_rdv', 'JAA1YJK6WElEWjAWzTFP', 'inv-kzs1ji5fjb', null, 'd2-inv-kzs1ji5fjb'),
    ('vers_rdv', '7Gd7siVeZGRuSlISpKwA', 'inv-rep-7Gd7siVeZGRuSlISpKwA', null, 'd1-inv-rep-7Gd7siVeZGRuSlISpKwA'),
    ('vers_rdv', 'ap-beyg923a9p', 'inv-g6b1ok1oog', null, 'd2-inv-g6b1ok1oog'),
    ('vers_rdv', '3l95awz77b', 'inv-otzgmj0fl3', null, 'd2-inv-otzgmj0fl3'),
    ('vers_facture', 'aozh2gx5mv', 'inv-opm8unk1ur', 25000, 'c-inv-opm8unk1ur'),
    ('vers_rdv', '4dg9yb8vrg', 'inv-bxj0oi9hef', null, 'd2-inv-bxj0oi9hef'),
    ('vers_facture', 'JGl0uUBbi7TRk0Xq3GrA', 'inv-rep-JGl0uUBbi7TRk0Xq3GrA', 61000, 'c-inv-rep-JGl0uUBbi7TRk0Xq3GrA'),
    ('vers_rdv', 'dtxroypl53', 'inv-qiiz6orczw', null, 'd2-inv-qiiz6orczw'),
    ('vers_rdv', '2u2ejuiczo', 'inv-ktzmadj3ok', null, 'd2-inv-ktzmadj3ok'),
    ('vers_rdv', 'ap-6kwa75jbj0', 'inv-4qt8koqunw', null, 'd2-inv-4qt8koqunw'),
    ('vers_rdv', 'b9a8vbqprs', 'inv-aq0wtwr2ir', null, 'd2-inv-aq0wtwr2ir'),
    ('vers_facture', '5b0pgcjpka', 'inv-479788v9l4', 40000, 'c-inv-479788v9l4'),
    ('vers_facture', 'izicvt7sq0', 'inv-riamxkuse5', 35000, 'c-inv-riamxkuse5'),
    ('vers_rdv', 't64Wlye07qFJyeNd7cjP', 'inv-rep-t64Wlye07qFJyeNd7cjP', null, 'd1-inv-rep-t64Wlye07qFJyeNd7cjP'),
    ('honore', 'G450ilCat16q8twig891', null, null, 'n-G450ilCat16q8twig891'),
    ('honore', '00a8j3wuym', null, null, 'n-00a8j3wuym'),
    ('honore', 'j5yiyr8t3t', null, null, 'n-j5yiyr8t3t'),
    ('honore', 'I3A8WDK0cISrBb5La7uI', null, null, 'n-I3A8WDK0cISrBb5La7uI'),
    ('honore', 'nv0nr8pdmo', null, null, 'n-nv0nr8pdmo'),
    ('honore', 'odl4e2a9za', null, null, 'n-odl4e2a9za'),
    ('honore', '1foarfpkp9', null, null, 'n-1foarfpkp9'),
    ('honore', 'ap-tr94ryo6of', null, null, 'n-ap-tr94ryo6of'),
    ('honore', 'n7cysrp0s6', null, null, 'n-n7cysrp0s6'),
    ('honore', 'wbmab9ktte', null, null, 'n-wbmab9ktte'),
    ('honore', 'ofcrl1i1px', null, null, 'n-ofcrl1i1px'),
    ('honore', 'qzvt748oze', null, null, 'n-qzvt748oze'),
    ('honore', 'xxilaeftmz', null, null, 'n-xxilaeftmz'),
    ('honore', '9m654ow2b2', null, null, 'n-9m654ow2b2'),
    ('honore', 'p91qdyo5hg', null, null, 'n-p91qdyo5hg'),
    ('honore', '7ddgpilvnq', null, null, 'n-7ddgpilvnq'),
    ('honore', '76szy0alid', null, null, 'n-76szy0alid'),
    ('honore', 'FnthlSvTDXvq4QpCryPe', null, null, 'n-FnthlSvTDXvq4QpCryPe'),
    ('honore', 'oz4f47pz5c', null, null, 'n-oz4f47pz5c'),
    ('honore', 'v7o2wh9u7k', null, null, 'n-v7o2wh9u7k'),
    ('honore', '81a73ip3e4', null, null, 'n-81a73ip3e4'),
    ('honore', 'eus29s9799', null, null, 'n-eus29s9799'),
    ('honore', '1evsv4tgun', null, null, 'n-1evsv4tgun'),
    ('honore', 'mBUnJJnVG1Fi6tfxzrXs', null, null, 'n-mBUnJJnVG1Fi6tfxzrXs'),
    ('honore', 'mqjixx5b9l', null, null, 'n-mqjixx5b9l'),
    ('honore', 'xnoejk7q7t', null, null, 'n-xnoejk7q7t'),
    ('honore', 'e6wnov8pb3', null, null, 'n-e6wnov8pb3'),
    ('honore', '3onm4rm8rh', null, null, 'n-3onm4rm8rh'),
    ('honore', 't9wyswv9pp', null, null, 'n-t9wyswv9pp'),
    ('honore', 'wllo4holjx', null, null, 'n-wllo4holjx'),
    ('honore', 'd5kxvhjgoy', null, null, 'n-d5kxvhjgoy'),
    ('honore', 'cuotezqf15', null, null, 'n-cuotezqf15'),
    ('honore', 'lajl6lgnqm', null, null, 'n-lajl6lgnqm'),
    ('honore', 'itoy3kp8tw', null, null, 'n-itoy3kp8tw'),
    ('honore', 'scgkvwpxhw', null, null, 'n-scgkvwpxhw'),
    ('honore', 'h0b1sucepf', null, null, 'n-h0b1sucepf'),
    ('honore', 'ooatTalf45PtlnpzEZ7F', null, null, 'n-ooatTalf45PtlnpzEZ7F'),
    ('honore', '3sdix6slo3', null, null, 'n-3sdix6slo3'),
    ('honore', 'mbbidmq2kr', null, null, 'n-mbbidmq2kr'),
    ('honore', '4lmmtyefts', null, null, 'n-4lmmtyefts'),
    ('honore', 'll0d1fipu7', null, null, 'n-ll0d1fipu7'),
    ('honore', 'qde7amqqyy', null, null, 'n-qde7amqqyy'),
    ('honore', 'kxzr032piv', null, null, 'n-kxzr032piv'),
    ('honore', 'x9t4p6iguh', null, null, 'n-x9t4p6iguh'),
    ('honore', '5bk9zahfo6', null, null, 'n-5bk9zahfo6'),
    ('honore', 'kepfpfcw4t', null, null, 'n-kepfpfcw4t'),
    ('honore', '4dg9yb8vrg', null, null, 'n-4dg9yb8vrg'),
    ('honore', 'atg2rp658m', null, null, 'n-atg2rp658m'),
    ('honore', 'bkpuieaahb', null, null, 'n-bkpuieaahb'),
    ('honore', 'lvt73xbzkw', null, null, 'n-lvt73xbzkw'),
    ('honore', '0pq6bpgtka', null, null, 'n-0pq6bpgtka'),
    ('honore', 'd00zcl66w4', null, null, 'n-d00zcl66w4'),
    ('honore', 'f9yucifi6t', null, null, 'n-f9yucifi6t'),
    ('honore', 'z5uoewuq8p', null, null, 'n-z5uoewuq8p'),
    ('honore', 'ew6g9r4pol', null, null, 'n-ew6g9r4pol'),
    ('restaure', 'v4pphdtamk', 'inv-92i4x0tqpo', null, 'g-inv-92i4x0tqpo'),
    ('relie', 'fqqb24xp23', 'inv-q9u29rhrst', null, 'g-inv-q9u29rhrst'),
    ('relie', 'gpbtxskv68', 'inv-yjl02lhrsl', null, 'g-inv-yjl02lhrsl'),
    ('relie', 'hamkg79mhm', 'inv-8o35qb4yuv', null, 'g-inv-8o35qb4yuv'),
    ('relie', 'ena4t69za4', 'inv-9k8f99hrsv', null, 'g-inv-9k8f99hrsv'),
    ('relie', 'vnnuyyfdw5', 'inv-35nc803ybs', null, 'g-inv-35nc803ybs'),
    ('relie', 'dg0p1zt75s', 'inv-t47prwhrsp', null, 'g-inv-t47prwhrsp'),
    ('restaure', 'yY1cnKK7nrlnp4GccATl', 'inv-wvpcarko58', null, 'g-inv-wvpcarko58'),
    ('date_facture', 'fr5ydxdkur', 'inv-zly109e6jx', null, 'l-inv-zly109e6jx'),
    ('date_facture', '1JUDv6JoZoqnTnkzXht0', 'inv-rep-1JUDv6JoZoqnTnkzXht0', null, 'l-inv-rep-1JUDv6JoZoqnTnkzXht0'),
    ('date_facture', '5gj1zm4auo', 'inv-mghwxd62iw', null, 'l-inv-mghwxd62iw'),
    ('date_facture', 'FfzLadaG6xU1EBxin8X0', 'inv-rep-FfzLadaG6xU1EBxin8X0', null, 'l-inv-rep-FfzLadaG6xU1EBxin8X0'),
    ('date_facture', 'ap-rttxbi7lsf', 'inv-5q5kqc9mqf', null, 'l-inv-5q5kqc9mqf'),
    ('date_facture', 'ap-4ktdtvti21', 'inv-zyrobtti2t', null, 'l-inv-zyrobtti2t'),
    ('date_facture', '9vy8woca69', 'inv-869yjbcx1z', null, 'l-inv-869yjbcx1z'),
    ('date_facture', 'r6zgg8rrft', 'inv-5axsm0jv7g', null, 'l-inv-5axsm0jv7g'),
    ('date_facture', 'ap-8njixovwlf', 'inv-ow02g8vwlx', null, 'l-inv-ow02g8vwlx'),
    ('date_facture', 'ap-9b61rfvwlf', 'inv-8gz2ax6o0e', null, 'l-inv-8gz2ax6o0e'),
    ('date_facture', 'kyzfbm71j0', 'inv-0bi0z17j7j', null, 'l-inv-0bi0z17j7j'),
    ('date_facture', '2wx7sf8byb', 'inv-iwu55j9d64', null, 'l-inv-iwu55j9d64'),
    ('date_facture', 'ap-k4x3x4ti21', 'inv-gy5s4rti2n', null, 'l-inv-gy5s4rti2n'),
    ('date_facture', 'r5d9bwxnix', 'inv-b2psh72w0t', null, 'l-inv-b2psh72w0t'),
    ('date_facture', 'xzjo65n5rv', 'inv-5s7dvtp56m', null, 'l-inv-5s7dvtp56m'),
    ('date_facture', '47bgfyx1io', 'inv-eczg15xr3n', null, 'l-inv-eczg15xr3n'),
    ('date_facture', 'esfsky5h0a', 'inv-g5pjrg5wi2', null, 'l-inv-g5pjrg5wi2'),
    ('date_facture', 'rqfqzvanv6', 'inv-k4x32ibxvm', null, 'l-inv-k4x32ibxvm'),
    ('date_facture', 'AHBUFgrRqWJvncnGuJnn', 'inv-rep-AHBUFgrRqWJvncnGuJnn', null, 'l-inv-rep-AHBUFgrRqWJvncnGuJnn'),
    ('date_facture', 'lvt73xbzkw', 'inv-znxwr0d3ru', null, 'l-inv-znxwr0d3ru'),
    ('relie', 'ap-a3jq6kyetx', 'inv-rep-05kmjbITwd4Hu0puNAAh', null, 'j-inv-rep-05kmjbITwd4Hu0puNAAh'),
    ('renumerote', null, 'inv-gybrkjjo2t', null, 'k-F-2026-0014'),
    ('renumerote', null, 'inv-keiwdd3ggx', null, 'k-F-2026-0388'),
    ('payee', null, 'inv-rep-guzeDxqTdQ2GMyuY2Xqm', null, 'p-inv-rep-guzeDxqTdQ2GMyuY2Xqm'),
    ('payee', null, 'inv-ef8d3uorwq', null, 'p-inv-ef8d3uorwq');

  -- Un rendez-vous confirmé à venir ne s'écrit jamais ici.
  drop table if exists pg_temp.intouchables;
  create temp table intouchables as
  select a.id from public.appointments a
  where a.data->>'status' = 'confirmé' and a.data->>'date' >= aujourdhui;

  -- Une décision dont la pièce a disparu depuis la vérification est sautée.
  saute := saute || coalesce((select jsonb_agg(jsonb_build_object('cle', z.cle, 'pourquoi', 'introuvable')) from decisions z
    where (z.rdv is not null and z.op <> 'restaure' and not exists (select 1 from public.appointments a where a.id = z.rdv))
       or (z.fac is not null and not exists (select 1 from public.invoices i where i.id = z.fac))), '[]'::jsonb);
  delete from decisions z
    where (z.rdv is not null and z.op <> 'restaure' and not exists (select 1 from public.appointments a where a.id = z.rdv))
       or (z.fac is not null and not exists (select 1 from public.invoices i where i.id = z.fac));

  -- ── ① REMETTRE depuis la trace (sans pose neuve) ─────────────────
  n := 0;
  for d in select * from decisions where op = 'restaure' loop
    if exists (select 1 from public.appointments where id = d.rdv) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'deja au carnet'); continue;
    end if;
    drop table if exists pg_temp.copie;
    create temp table copie as
    select t.branch_id, t.fait_le,
           (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(t.avant) e
             where e.value <> to_jsonb('(trop long pour la trace)'::text)) as data
    from public.traces t where t.table_name = 'appointments' and t.operation = 'efface' and t.piece_id = d.rdv
      and jsonb_typeof(t.avant) = 'object'
    order by t.fait_le desc limit 1;
    if not exists (select 1 from copie) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'pas de copie dans la trace'); continue;
    end if;
    set local session_replication_role = replica;
    insert into public.appointments (id, branch_id, data, updated_at) select d.rdv, branch_id, data, fait_le from copie;
    set local session_replication_role = origin;
    insert into public.traces (fait_le, table_name, piece_id, branch_id, operation, compte_nom, porte, avant, apres)
    select now(), 'appointments', d.rdv, branch_id, 'modifie', 'Réparation 0119 · carnet et factures', 'base',
           jsonb_build_object('etat', 'effacé le ' || to_char(fait_le, 'YYYY-MM-DD HH24:MI:SS')), public.trace_allege(data)
    from copie;
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('remis_depuis_la_trace', n);

  -- ── ② RELIER une facture au rendez-vous refait le même jour ───────
  n := 0;
  for d in select * from decisions where op = 'relie' loop
    if d.rdv in (select id from intouchables) or not exists (select 1 from public.appointments where id = d.rdv)
       or exists (select 1 from public.appointments where id = d.rdv and coalesce(data->>'invoiceId', d.fac) <> d.fac)
       or exists (select 1 from public.invoices where data->>'apptId' = d.rdv and id <> d.fac) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'le rendez-vous a deja sa facture : celle-ci est a supprimer a la main'); continue;
    end if;
    update public.invoices set data = data || jsonb_build_object('apptId', d.rdv) where id = d.fac;
    update public.appointments set data = data || jsonb_build_object('invoiceId', d.fac) where id = d.rdv;
    insert into decisions values ('vers_rdv', d.rdv, d.fac, null, d.cle || '+versements');
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('factures_reliees', n);

  -- ── ③ La FACTURE reçoit le détail des versements du rendez-vous ────
  n := 0;
  for d in select * from decisions where op = 'vers_facture' loop
    if d.rdv in (select id from intouchables)
       or exists (select 1 from public.invoices i where i.id = d.fac
                   and jsonb_typeof(i.data->'payments') = 'array' and jsonb_array_length(i.data->'payments') > 0) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'la facture a deja des versements'); continue;
    end if;
    update public.invoices i set data = i.data
      || jsonb_build_object('payments', (
           select coalesce(jsonb_agg((v.e - 'invoiceId')
                    || jsonb_build_object('method', coalesce(v.e->>'method', i.data->>'payment', 'Espèces'))
                    || case when v.e ? 'cashbox' or i.data->'cashbox' is null then '{}'::jsonb
                            else jsonb_build_object('cashbox', i.data->'cashbox') end
                  order by v.o), '[]'::jsonb)
           from public.appointments a, jsonb_array_elements(a.data->'payments') with ordinality v(e, o)
           where a.id = d.rdv and coalesce((v.e->>'amountXof')::numeric, 0) > 0
             and coalesce(v.e->>'invoiceId', d.fac) = d.fac))
      || case when i.data->>'status' <> 'payée' and d.montant is not null and (
                select coalesce(sum((v.e->>'amountXof')::numeric), 0)
                from public.appointments a, jsonb_array_elements(a.data->'payments') v(e)
                where a.id = d.rdv and coalesce(v.e->>'invoiceId', d.fac) = d.fac) >= d.montant
              then jsonb_build_object('status', 'payée') else '{}'::jsonb end
    where i.id = d.fac;
    update public.appointments a set data = a.data || jsonb_build_object('payments', (
             select jsonb_agg(case when coalesce((v.e->>'amountXof')::numeric, 0) > 0 and v.e->>'invoiceId' is null
                                   then v.e || jsonb_build_object('invoiceId', d.fac) else v.e end order by v.o)
             from jsonb_array_elements(a.data->'payments') with ordinality v(e, o)))
      || case when a.data->>'invoiceId' is null then jsonb_build_object('invoiceId', d.fac) else '{}'::jsonb end
    where a.id = d.rdv and jsonb_typeof(a.data->'payments') = 'array';
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('factures_qui_recoivent_le_detail', n);

  -- ── ④ Le RENDEZ-VOUS prend le découpage de la facture ─────────────
  n := 0;
  for d in select * from decisions where op = 'detail_facture' loop
    if d.rdv in (select id from intouchables)
       or (select coalesce(sum((v->>'amountXof')::numeric), 0) from public.invoices i, jsonb_array_elements(i.data->'payments') v where i.id = d.fac)
       <> (select coalesce(sum((v->>'amountXof')::numeric), 0) from public.appointments a, jsonb_array_elements(a.data->'payments') v
            where a.id = d.rdv and coalesce(v->>'invoiceId', d.fac) = d.fac) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'les totaux ne sont plus egaux'); continue;
    end if;
    update public.appointments a set data = a.data || jsonb_build_object('payments',
      coalesce((select jsonb_agg(v.e order by v.o) from jsonb_array_elements(a.data->'payments') with ordinality v(e, o)
                 where not (coalesce((v.e->>'amountXof')::numeric, 0) > 0 and coalesce(v.e->>'invoiceId', d.fac) = d.fac)), '[]'::jsonb)
      || (select coalesce(jsonb_agg(p || jsonb_build_object('invoiceId', d.fac)), '[]'::jsonb)
            from public.invoices i, jsonb_array_elements(i.data->'payments') p where i.id = d.fac))
    where a.id = d.rdv;
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('rendez_vous_au_decoupage_de_la_facture', n);

  -- ── ⑥ L'ALIGNEMENT du 0118, sur tout le carnet ────────────────────
  -- (les factures reliées en ② et les rendez-vous remis en ① en ont besoin ;
  -- et le retrait des doubles se juge APRÈS, sur des identifiants alignés :
  -- sinon une garde qui saute au premier passage agirait au second)
  drop table if exists pg_temp.alignements;
  create temp table alignements as
  with
  rdv as (
    select a.id, a.data->>'invoiceId' as facture,
           case when jsonb_typeof(a.data->'payments') = 'array' then a.data->'payments' else '[]'::jsonb end as versements
    from public.appointments a where a.id not in (select id from intouchables)
  ),
  fac as (
    select i.id, i.data->>'apptId' as rdv,
           case when jsonb_typeof(i.data->'payments') = 'array' then i.data->'payments' else '[]'::jsonb end as versements
    from public.invoices i
  ),
  rv as (
    select r.id as rdv, r.facture as facture_du_rdv, v.pos, v.e->>'id' as vid, v.e->>'date' as jour,
           (v.e->>'amountXof')::numeric as montant, v.e->>'invoiceId' as facture_du_versement
    from rdv r cross join lateral jsonb_array_elements(r.versements) with ordinality v(e, pos)
    where coalesce((v.e->>'amountXof')::numeric, 0) > 0
  ),
  fv as (
    select f.id as facture, v->>'id' as vid, v->>'date' as jour, (v->>'amountXof')::numeric as montant
    from fac f cross join lateral jsonb_array_elements(f.versements) v
    where coalesce((v->>'amountXof')::numeric, 0) > 0
  ),
  liens as (
    select r.id as rdv, f.id as facture from rdv r join fac f on f.id = r.facture
    union select f.rdv, f.id from fac f join rdv r on r.id = f.rdv
    union select rv.rdv, f.id from rv join fac f on f.id = rv.facture_du_versement
  ),
  lrv as (
    select l.rdv, l.facture, rv.pos, rv.vid, rv.jour, rv.montant from liens l join rv on rv.rdv = l.rdv
    where rv.facture_du_versement = l.facture
       or (rv.facture_du_versement is null and (rv.facture_du_rdv = l.facture or (rv.facture_du_rdv is null and (select count(*) from liens m where m.rdv = l.rdv) = 1)))
  ),
  lfv as (select l.rdv, l.facture, fv.vid, fv.jour, fv.montant from liens l join fv on fv.facture = l.facture),
  r1 as (select * from lrv x where not exists (select 1 from lfv y where y.facture = x.facture and y.rdv = x.rdv and y.vid = x.vid)),
  f1 as (select * from lfv y where not exists (select 1 from lrv x where x.facture = y.facture and x.rdv = y.rdv and x.vid = y.vid)),
  r1n as (select *, row_number() over (partition by rdv, facture, jour, montant order by pos) as n from r1),
  f1n as (select *, row_number() over (partition by rdv, facture, jour, montant order by vid) as n from f1),
  pa as (select r.rdv, r.facture, r.pos, f.vid as vid_fac, null::text as date_fac
         from r1n r join f1n f on f.rdv = r.rdv and f.facture = r.facture and f.jour is not distinct from r.jour and f.montant = r.montant and f.n = r.n),
  r2 as (select * from r1 x where not exists (select 1 from pa where pa.rdv = x.rdv and pa.facture = x.facture and pa.pos = x.pos)),
  f2 as (select * from f1 y where not exists (select 1 from pa where pa.rdv = y.rdv and pa.facture = y.facture and pa.vid_fac = y.vid)),
  r2n as (select *, row_number() over (partition by rdv, facture, montant order by jour, pos) as n from r2),
  f2n as (select *, row_number() over (partition by rdv, facture, montant order by jour, vid) as n from f2),
  pb as (select r.rdv, r.facture, r.pos, f.vid as vid_fac, f.jour as date_fac
         from r2n r join f2n f on f.rdv = r.rdv and f.facture = r.facture and f.montant = r.montant and f.n = r.n)
  select * from pa union all select * from pb;
  delete from alignements x where (select count(*) from alignements y where y.rdv = x.rdv and y.pos = x.pos) > 1;
  update public.appointments a
  set data = jsonb_set(a.data, '{payments}', (
    select jsonb_agg(case when m.rdv is null then v.e
                          else v.e || jsonb_build_object('id', m.vid_fac, 'invoiceId', m.facture)
                               || case when m.date_fac is not null then jsonb_build_object('date', m.date_fac) else '{}'::jsonb end
                     end order by v.pos)
    from jsonb_array_elements(a.data->'payments') with ordinality v(e, pos)
    left join alignements m on m.rdv = a.id and m.pos = v.pos))
  where a.id in (select rdv from alignements) and jsonb_typeof(a.data->'payments') = 'array';
  get diagnostics n = row_count;
  fait := fait || jsonb_build_object('rendez_vous_alignes', n);

  -- ── ⑤ RETIRER de la facture le versement en double ────────────────
  -- Ne restent que les versements que le rendez-vous connaît, et seulement
  -- si ce qui reste égale le total de la pièce.
  n := 0;
  for d in select * from decisions where op = 'retire_double' loop
    if (select coalesce(sum((p->>'amountXof')::numeric), 0) from public.invoices i, jsonb_array_elements(i.data->'payments') p
         where i.id = d.fac and p->>'id' in (select v->>'id' from public.appointments a, jsonb_array_elements(a.data->'payments') v where a.id = d.rdv))
       is distinct from d.montant then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'le reste ne ferait pas le total'); continue;
    end if;
    update public.invoices i set data = i.data || jsonb_build_object('payments', (
      select jsonb_agg(p order by o) from jsonb_array_elements(i.data->'payments') with ordinality x(p, o)
      where p->>'id' in (select v->>'id' from public.appointments a, jsonb_array_elements(a.data->'payments') v where a.id = d.rdv)))
    where i.id = d.fac;
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('doubles_retires', n);

  -- ── ⑦ Le RENDEZ-VOUS reçoit les versements de la facture qui lui manquent
  -- Seulement si, après coup, le rendez-vous porte exactement ce que porte la
  -- facture.
  n := 0;
  for d in select * from decisions where op = 'vers_rdv' loop
    if d.rdv in (select id from intouchables) or not exists (select 1 from public.appointments where id = d.rdv) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'rendez-vous absent ou a venir'); continue;
    end if;
    drop table if exists pg_temp.manquants;
    create temp table manquants as
    select p from public.invoices i, jsonb_array_elements(i.data->'payments') p
    where i.id = d.fac and coalesce((p->>'amountXof')::numeric, 0) > 0
      and p->>'id' not in (select coalesce(v->>'id', '') from public.appointments a, jsonb_array_elements(
                             case when jsonb_typeof(a.data->'payments') = 'array' then a.data->'payments' else '[]'::jsonb end) v where a.id = d.rdv);
    if not exists (select 1 from manquants) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'rien ne manque'); continue;
    end if;
    if (select coalesce(sum((v->>'amountXof')::numeric), 0) from public.appointments a, jsonb_array_elements(
          case when jsonb_typeof(a.data->'payments') = 'array' then a.data->'payments' else '[]'::jsonb end) v
         where a.id = d.rdv and coalesce((v->>'amountXof')::numeric, 0) > 0 and coalesce(v->>'invoiceId', d.fac) = d.fac)
       + (select sum((p->>'amountXof')::numeric) from manquants)
       <> (select coalesce(sum((p->>'amountXof')::numeric), 0) from public.invoices i, jsonb_array_elements(i.data->'payments') p
            where i.id = d.fac and coalesce((p->>'amountXof')::numeric, 0) > 0) then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'les sommes ne tomberaient pas juste'); continue;
    end if;
    update public.appointments a set data = a.data || jsonb_build_object('payments',
        (case when jsonb_typeof(a.data->'payments') = 'array' then a.data->'payments' else '[]'::jsonb end)
        || (select jsonb_agg(p || jsonb_build_object('invoiceId', d.fac)) from manquants))
      || case when a.data->>'invoiceId' is null then jsonb_build_object('invoiceId', d.fac) else '{}'::jsonb end
    where a.id = d.rdv;
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('rendez_vous_completes', n);

  -- ── ⑧ HONORÉ : le statut seulement ────────────────────────────────
  update public.appointments a set data = a.data || jsonb_build_object('status', 'honoré')
  where a.id in (select rdv from decisions where op = 'honore')
    and a.data->>'status' in ('confirmé', 'en attente') and a.data->>'date' < aujourdhui;
  get diagnostics n = row_count;
  fait := fait || jsonb_build_object('passes_en_honore', n);

  -- ── ⑨ La FACTURE prend la date du rituel ─────────────────────────
  update public.invoices i set data = i.data || jsonb_build_object('date', a.data->>'date')
  from decisions z join public.appointments a on a.id = z.rdv
  where z.op = 'date_facture' and i.id = z.fac and a.data->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and i.data->>'date' is distinct from a.data->>'date';
  get diagnostics n = row_count;
  fait := fait || jsonb_build_object('factures_redatees', n);

  -- ── ⑩ NOUVEAU NUMÉRO pour la plus récente des deux (règle du Trône :
  -- le plus grand numéro de la série de l'année, plus un) ────────────
  n := 0;
  for d in select * from decisions where op = 'renumerote' loop
    select 'F-2026-' || lpad((coalesce(max((substring(data->>'number' from '^F-2026-(\d+)$'))::int), 0) + 1)::text, 4, '0')
      into num from public.invoices where data->>'number' ~ '^F-2026-\d+$';
    if (select count(*) from public.invoices where data->>'number' = (select data->>'number' from public.invoices where id = d.fac)) < 2 then
      saute := saute || jsonb_build_object('cle', d.cle, 'pourquoi', 'numero deja unique'); continue;
    end if;
    update public.invoices set data = data || jsonb_build_object('number', num) where id = d.fac;
    fait := fait || jsonb_build_object('nouveau_numero_' || d.cle, num);
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('factures_renumerotees', n);

  -- ── ⑪ SOLDÉE donc PAYÉE ──────────────────────────────────────────
  update public.invoices set data = data || jsonb_build_object('status', 'payée')
  where id in (select fac from decisions where op = 'payee') and data->>'status' in ('envoyée', 'brouillon');
  get diagnostics n = row_count;
  fait := fait || jsonb_build_object('factures_dites_payees', n);

  insert into public.repli_0119_compte_rendu (compte_rendu) values (jsonb_build_object(
    'fait', fait, 'sautes', saute,
    'secours', jsonb_build_object('rendez_vous', (select count(*) from public.repli_0119_appointments),
                                  'factures', (select count(*) from public.repli_0119_invoices))));
end
$bloc$;

select to_char(fait_le at time zone 'Africa/Porto-Novo', 'DD/MM HH24:MI') as passe_le, jsonb_pretty(compte_rendu) as compte_rendu
from public.repli_0119_compte_rendu order by fait_le desc limit 1;
