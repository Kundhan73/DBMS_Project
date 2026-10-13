# Generates the ER diagram (crow's-foot notation) from the live schema.
import subprocess, json, os
q = """
select json_build_object(
 'cols', (select json_agg(json_build_object('t',c.table_name,'c',c.column_name,'ty',c.data_type,'dom',c.domain_name,'nn',c.is_nullable='NO') order by c.table_name,c.ordinal_position)
          from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
          where c.table_schema='public' and t.table_type='BASE TABLE'),
 'pk', (select json_agg(json_build_object('t',tc.table_name,'c',k.column_name)) from information_schema.table_constraints tc join information_schema.key_column_usage k using(constraint_schema,constraint_name) where tc.constraint_type='PRIMARY KEY' and tc.table_schema='public'),
 'fk', (select json_agg(json_build_object('t',cl.relname,'c',a.attname,'rt',rcl.relname,'nn',a.attnotnull, 'uq', exists(select 1 from pg_index i where i.indrelid=cl.oid and i.indisunique and i.indnatts=1 and i.indkey[0]=a.attnum)))
        from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_class rcl on rcl.oid=co.confrelid
        join pg_attribute a on a.attrelid=co.conrelid and a.attnum=co.conkey[1] where co.contype='f'))"""
env = dict(os.environ, PGPASSWORD='aptmgr_dev')
d = json.loads(subprocess.check_output(['psql','-h','localhost','-U','aptmgr','-d','aptmgr','-Atc',q], env=env))
pk = {(x['t'],x['c']) for x in d['pk']}
fk = {(x['t'],x['c']) for x in d['fk']}
tables = {}
for c in d['cols']:
    if c['c'] in ('search_tsv',): pass
    tables.setdefault(c['t'], []).append(c)
groups = {
 'People & access': ['app_user','owner_profile','tenant_profile','complex_manager'],
 'Property': ['complex','block','unit','ownership'],
 'Leasing & billing': ['lease','invoice','payment'],
 'Parking': ['parking_slot','vehicle','parking_allocation'],
 'Maintenance (SQL + vector)': ['vendor','maintenance_request','request_embedding','maintenance_status_history'],
 'Audit': ['audit_log'],
}
colors = {'People & access':'#e8f1fb','Property':'#e7f4ef','Leasing & billing':'#fdf3e3','Parking':'#f1edfb','Maintenance (SQL + vector)':'#fbeaea','Audit':'#eef0f2'}
def ty(c):
    t = c['dom'] or c['ty']
    return {'character varying':'varchar','timestamp with time zone':'timestamptz','USER-DEFINED':'vector(384)','ARRAY':'text[]','character':'char'}.get(t,t)
out = ['digraph ER {','graph [rankdir=LR, splines=ortho, nodesep=0.45, ranksep=1.1, fontname="Helvetica", bgcolor="white", pad=0.3];',
       'node [shape=plain, fontname="Helvetica", fontsize=10];','edge [fontname="Helvetica", fontsize=9, color="#5d6874", arrowsize=0.8];']
for g, ts in groups.items():
    out.append(f'subgraph "cluster_{g}" {{ label="{g}"; fontsize=12; fontcolor="#17212b"; style="rounded,dashed"; color="#b8c0c8";')
    for t in ts:
        rows = ''
        
        for c in tables[t]:
            key = ('PK FK' if (t,c['c']) in fk else 'PK') if (t,c['c']) in pk else ('FK' if (t,c['c']) in fk else '')
            keycell = '<font color="#0d6b61"><b>' + key + '</b></font>' if key else ' '
            name = f'<b>{c["c"]}</b>' if key=='PK' else (f'<i>{c["c"]}</i>' if key=='FK' else c['c'])
            rows += f'<tr><td align="left" width="38">{keycell}</td><td align="left">{name}</td><td align="left"><font color="#8a939d">{ty(c)}{"" if c["nn"] or key=="PK" else " (null)"}</font></td></tr>'
        out.append(f'"{t}" [label=<<table border="0" cellborder="0" cellspacing="0" cellpadding="3" bgcolor="white" style="rounded"><tr><td colspan="3" bgcolor="{colors[g]}"><b>{t}</b></td></tr>{rows}</table>> , style=""];')
        out[-1] = out[-1].replace(', style=""]', ', color="#9aa4ae"]')
    out.append('}')
for x in d['fk']:
    # child (many) -> parent (one); unique FK = one-to-one
    head = 'teetee' if x['nn'] else 'teeodot'
    tail = 'teetee' if x['uq'] else 'crowodot'
    out.append(f'"{x["t"]}" -> "{x["rt"]}" [arrowhead={head}, arrowtail={tail}, dir=both, xlabel="{x["c"]}"];')
out.append('}')
open('er_diagram.dot','w').write('\n'.join(out))
