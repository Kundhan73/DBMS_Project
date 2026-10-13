#!/usr/bin/env python3
"""Generates docs/DATA_DICTIONARY.md and docs/RELATIONAL_SCHEMA.md from the live database catalogue."""
import json, os, subprocess, sys
url = os.environ.get('DATABASE_URL') or [l.split('=',1)[1].strip() for l in open('.env.local') if l.startswith('DATABASE_URL=')][0]
Q = r"""
select json_agg(t order by t.ord) from (
 select c.relname as name, obj_description(c.oid) as comment,
  (select min(ordinality) from unnest(array['app_user','complex','complex_manager','block','unit','owner_profile','tenant_profile','ownership','lease','invoice','payment','parking_slot','vehicle','parking_allocation','vendor','maintenance_request','request_embedding','maintenance_status_history','audit_log']) with ordinality a(n) where a.n=c.relname) as ord,
  (select json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,
          'default', pg_get_expr(d.adbin,d.adrelid), 'comment', col_description(c.oid,a.attnum),
          'generated', a.attgenerated, 'identity', a.attidentity) order by a.attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as cols,
  (select json_agg(json_build_object('name',co.conname,'type',co.contype,'def',pg_get_constraintdef(co.oid)) order by co.contype, co.conname)
     from pg_constraint co where co.conrelid=c.oid) as cons,
  (select json_agg(json_build_object('name',i.relname,'def',pg_get_indexdef(i.oid)) order by i.relname)
     from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid and not x.indisprimary) as idx,
  (select json_agg(tg.tgname order by tg.tgname) from pg_trigger tg where tg.tgrelid=c.oid and not tg.tgisinternal) as trg
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r') t"""
rows = json.loads(subprocess.check_output(['psql', url, '-Atc', Q]))
KIND = {'p':'PRIMARY KEY','f':'FOREIGN KEY','u':'UNIQUE','c':'CHECK','x':'EXCLUDE'}
dd = ['# Data dictionary', '', 'Generated from the PostgreSQL catalogue by `scripts/gen-data-dictionary.py`. Types shown are the declared types; `email_address`, `phone_in` and `money_inr` are validating domains (see `db/01_schema.sql`).', '']
rs = ['# Relational schema', '', 'Underlined = primary key, *italic* = foreign key (→ referenced table). Generated from the live database.', '']
for t in rows:
    pk = set(); fk = {}
    for c in t['cons'] or []:
        if c['type']=='p': pk |= {x.strip() for x in c['def'][c['def'].index('(')+1:c['def'].index(')')].split(',')}
        if c['type']=='f':
            col = c['def'][c['def'].index('(')+1:c['def'].index(')')]
            fk[col] = c['def'].split('REFERENCES ')[1].split('(')[0]
    dd += [f"## {t['name']}", '', t['comment'] or '', '', '| Column | Type | Null | Key | Default / notes |', '|---|---|---|---|---|']
    for c in t['cols']:
        key = ' '.join(k for k,v in (('PK', c['name'] in pk), ('FK→'+fk.get(c['name'],''), c['name'] in fk)) if v)
        notes = []
        if c['identity']: notes.append('identity')
        if c['generated']=='s': notes.append('generated (stored)')
        elif c['default']: notes.append('default ' + c['default'].replace('|','\\|'))
        if c['comment']: notes.append(c['comment'])
        dd.append(f"| {c['name']} | {c['type']} | {'' if c['notnull'] else 'yes'} | {key} | {'; '.join(notes)} |")
    cons = [c for c in (t['cons'] or []) if c['type'] in 'cux']
    if cons:
        dd += ['', '**Constraints**', '']
        dd += [f"- `{c['name']}` ({KIND[c['type']]}): `{' '.join(c['def'].split())}`" for c in cons]
    if t['idx']:
        dd += ['', '**Indexes**', ''] + [f"- `{i['name']}`: `{i['def'].split(' USING ')[-1] if ' USING ' in i['def'] else i['def']}`" for i in t['idx']]
    if t['trg']:
        dd += ['', '**Triggers**: ' + ', '.join(f'`{x}`' for x in t['trg'])]
    dd.append('')
    def fmt(n):
        s = f'*{n}*' if n in fk else n
        if n in pk: s = f'<u>{s}</u>'
        return s + (f' → {fk[n]}' if n in fk else '')
    cols = ', '.join(fmt(c['name']) for c in t['cols'])
    rs.append(f"- **{t['name']}**({cols})")
open('docs/DATA_DICTIONARY.md','w').write('\n'.join(dd)+'\n')
open('docs/RELATIONAL_SCHEMA.md','w').write('\n'.join(rs)+'\n')
print('wrote', len(rows), 'tables')
