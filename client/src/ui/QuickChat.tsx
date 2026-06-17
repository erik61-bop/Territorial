import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGame } from '../state/store';
import { cssPlayer } from '../render/colors';
import { TEMPLATES, CATEGORIES, TEMPLATE_BY_ID, formatMessage, ChatCategory } from '../chat/templates';
import { sendChat, sendDiplo } from '../net/socket';

const label = (id: number, me: number) => (id === me ? 'you' : `P${id}`);

export default function QuickChat() {
  const playerId = useGame((s) => s.playerId);
  const snap = useGame((s) => s.snap);
  const chat = useGame((s) => s.chat);

  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<ChatCategory>('Diplomacy');
  const [pending, setPending] = useState<string | null>(null);

  if (!snap || playerId < 0) return null;

  const alive = snap.alive.map((a, id) => ({ a, id })).filter((p) => p.a && p.id !== playerId).map((p) => p.id);
  const peaceOffers = alive.filter((id) => snap.offer?.[id]?.[playerId]);
  const allyOffers = alive.filter((id) => snap.allyOffer?.[id]?.[playerId]);
  const myRel = snap.rel?.[playerId] ?? [];
  const treaties = alive.filter((id) => myRel[id] === 1 || myRel[id] === 2);

  const pick = (id: string) => {
    const t = TEMPLATE_BY_ID[id];
    if (t?.requiresTarget) { setPending(id); return; }
    sendChat(id, -1);
  };
  const pickTarget = (target: number) => { if (pending) sendChat(pending, target); setPending(null); };

  return (
    <>
      {/* incoming offers — top-centre, under the phase banner */}
      {(peaceOffers.length > 0 || allyOffers.length > 0) && (
        <View style={styles.offers}>
          {allyOffers.map((from) => (
            <View key={'a' + from} style={styles.offerRow}>
              <View style={[styles.dot, { backgroundColor: cssPlayer(from) }]} />
              <Text style={styles.offerTxt}>P{from} offers an alliance</Text>
              <Pressable style={styles.accept} onPress={() => sendDiplo('ACCEPT_ALLY', from)}><Text style={styles.btnTxt}>Ally</Text></Pressable>
            </View>
          ))}
          {peaceOffers.map((from) => (
            <View key={'p' + from} style={styles.offerRow}>
              <View style={[styles.dot, { backgroundColor: cssPlayer(from) }]} />
              <Text style={styles.offerTxt}>P{from} offers peace</Text>
              <Pressable style={styles.accept} onPress={() => sendDiplo('ACCEPT_PEACE', from)}><Text style={styles.btnTxt}>Accept</Text></Pressable>
            </View>
          ))}
        </View>
      )}

      {/* recent messages — floating, lower-left */}
      <View style={styles.log} pointerEvents="none">
        {chat.map((m) => (
          <Text key={m.key} style={styles.logLine}>
            <Text style={{ color: cssPlayer(m.from), fontWeight: '800' }}>{label(m.from, playerId)}</Text>
            <Text style={styles.logTxt}>{'  ' + formatMessage(m.templateId, m.target, (id) => label(id, playerId))}</Text>
          </Text>
        ))}
      </View>

      {/* right-side quick-chat panel */}
      <View style={styles.panel}>
        <Pressable style={styles.header} onPress={() => setOpen((o) => !o)}>
          <Text style={styles.headerTxt}>QUICK CHAT</Text>
          <Text style={styles.collapse}>{open ? '▾' : '▸'}</Text>
        </Pressable>

        {open && (
          <>
            <View style={styles.tabs}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => { setTab(c); setPending(null); }} style={[styles.tab, tab === c && styles.tabActive]}>
                  <Text style={[styles.tabTxt, tab === c && styles.tabTxtActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            {pending ? (
              <View style={styles.body}>
                <Text style={styles.hint}>send to…</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.targets}>
                    {alive.map((id) => (
                      <Pressable key={id} style={styles.target} onPress={() => pickTarget(id)}>
                        <View style={[styles.dot, { backgroundColor: cssPlayer(id) }]} />
                        <Text style={styles.btnTxt}>P{id}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Pressable onPress={() => setPending(null)}><Text style={styles.cancel}>cancel</Text></Pressable>
              </View>
            ) : (
              <View style={styles.body}>
                <View style={styles.msgGrid}>
                  {TEMPLATES.filter((t) => t.category === tab).map((t) => (
                    <Pressable key={t.id} style={styles.msg} onPress={() => pick(t.id)}>
                      <Text style={styles.msgTxt}>{t.text}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {treaties.length > 0 && (
              <View style={styles.treaties}>
                <Text style={styles.hint}>treaties:</Text>
                {treaties.map((id) => {
                  const ally = myRel[id] === 2;
                  return (
                    <Pressable key={id} style={[styles.treaty, ally && styles.allyTreaty]} onPress={() => sendDiplo(ally ? 'BREAK_ALLY' : 'BREAK_PEACE', id)}>
                      <View style={[styles.dot, { backgroundColor: cssPlayer(id) }]} />
                      <Text style={styles.treatyTxt}>{ally ? '🛡️' : '🤝'} P{id} ✕</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', right: 12, top: 96, width: 300, padding: 10, borderRadius: 12,
    backgroundColor: 'rgba(15,18,28,0.92)', borderWidth: 1, borderColor: '#2a3145',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerTxt: { color: '#f0c040', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  collapse: { color: '#8aa0c8', fontSize: 14 },
  tabs: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 6, borderRadius: 7, backgroundColor: '#222838', alignItems: 'center' },
  tabActive: { backgroundColor: '#2f6df0' },
  tabTxt: { color: '#9fb0cf', fontSize: 11, fontWeight: '700' },
  tabTxtActive: { color: '#fff' },
  body: { minHeight: 96 },
  msgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  msg: { backgroundColor: '#262d40', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, minWidth: 132, flexGrow: 1 },
  msgTxt: { color: '#e8edf7', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  targets: { flexDirection: 'row', gap: 6 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#262d40', paddingVertical: 8, paddingHorizontal: 11, borderRadius: 8 },
  hint: { color: '#8aa0c8', fontSize: 11, marginBottom: 6 },
  cancel: { color: '#8aa0c8', fontSize: 12, marginTop: 8 },
  treaties: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 10, borderTopWidth: 1, borderTopColor: '#2a3145', paddingTop: 8 },
  treaty: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2a3550', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  allyTreaty: { backgroundColor: '#3a4d2a' },
  treatyTxt: { color: '#cdd6f4', fontSize: 12 },
  offers: { position: 'absolute', top: 86, alignSelf: 'center', left: 0, right: 0, alignItems: 'center', gap: 6 },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(15,18,28,0.92)', borderWidth: 1, borderColor: '#2a3145', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  offerTxt: { color: '#e8edf7', fontSize: 13 },
  accept: { backgroundColor: '#46a35a', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  log: { position: 'absolute', left: 12, bottom: 150, maxWidth: 320, gap: 2 },
  logLine: { fontSize: 13 },
  logTxt: { color: '#e8edf7', fontSize: 13 },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
