import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGame } from '../state/store';
import { cssPlayer } from '../render/colors';
import { TEMPLATES, TEMPLATE_BY_ID, formatMessage } from '../chat/templates';
import { sendChat, sendDiplo } from '../net/socket';

const label = (id: number, me: number) => (id === me ? 'you' : `P${id}`);

export default function Chat() {
  const playerId = useGame((s) => s.playerId);
  const snap = useGame((s) => s.snap);
  const chat = useGame((s) => s.chat);

  const [open, setOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);

  if (!snap || playerId < 0) return null;

  const alivePlayers = snap.alive
    .map((a, id) => ({ id, a }))
    .filter((p) => p.a && p.id !== playerId)
    .map((p) => p.id);

  // peace offers made TO me, and my active treaties
  const offersToMe = alivePlayers.filter((id) => snap.offer?.[id]?.[playerId]);
  const myRel = snap.rel?.[playerId] ?? [];
  const treaties = alivePlayers.filter((id) => myRel[id] === 1 || myRel[id] === 2);

  const pick = (templateId: string) => {
    const t = TEMPLATE_BY_ID[templateId];
    if (t?.requiresTarget) { setPendingTemplate(templateId); return; }
    sendChat(templateId, -1);
    setOpen(false);
  };
  const pickTarget = (target: number) => {
    if (pendingTemplate) sendChat(pendingTemplate, target);
    setPendingTemplate(null);
    setOpen(false);
  };

  return (
    <>
      {/* incoming peace offers */}
      {offersToMe.length > 0 && (
        <View style={[styles.panel, styles.offers]}>
          {offersToMe.map((from) => (
            <View key={from} style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: cssPlayer(from) }]} />
              <Text style={styles.txt}>P{from} offers peace</Text>
              <Pressable style={styles.accept} onPress={() => sendDiplo('ACCEPT_PEACE', from)}>
                <Text style={styles.btnTxt}>Accept</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* chat log + controls, bottom-left */}
      <View style={styles.dock}>
        <View style={styles.log}>
          {chat.map((m) => (
            <Text key={m.key} style={styles.logLine}>
              <Text style={{ color: cssPlayer(m.from), fontWeight: '700' }}>{label(m.from, playerId)}</Text>
              <Text style={styles.txt}>{'  ' + formatMessage(m.templateId, m.target, (id) => label(id, playerId))}</Text>
            </Text>
          ))}
        </View>

        {treaties.length > 0 && (
          <View style={styles.treaties}>
            <Text style={styles.dim}>peace: </Text>
            {treaties.map((id) => (
              <Pressable key={id} style={styles.treaty} onPress={() => sendDiplo('BREAK_PEACE', id)}>
                <View style={[styles.dot, { backgroundColor: cssPlayer(id) }]} />
                <Text style={styles.treatyTxt}>P{id} ✕</Text>
              </Pressable>
            ))}
          </View>
        )}

        {open && (
          <View style={styles.panel}>
            {pendingTemplate ? (
              <>
                <Text style={styles.dim}>send to…</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.row}>
                    {alivePlayers.map((id) => (
                      <Pressable key={id} style={styles.target} onPress={() => pickTarget(id)}>
                        <View style={[styles.dot, { backgroundColor: cssPlayer(id) }]} />
                        <Text style={styles.btnTxt}>P{id}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : (
              <View style={styles.msgWrap}>
                {TEMPLATES.map((t) => (
                  <Pressable key={t.id} style={styles.msg} onPress={() => pick(t.id)}>
                    <Text style={styles.btnTxt}>{t.text}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        <Pressable style={styles.chatBtn} onPress={() => { setOpen((o) => !o); setPendingTemplate(null); }}>
          <Text style={styles.chatBtnTxt}>{open ? 'Close' : '💬 Chat'}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: 'rgba(20,20,28,0.9)', padding: 8, borderRadius: 10, marginTop: 6 },
  offers: { position: 'absolute', top: 12, alignSelf: 'center' },
  dock: { position: 'absolute', left: 12, bottom: 16, maxWidth: 360 },
  log: { gap: 2 },
  logLine: { fontSize: 13 },
  treaties: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  treaty: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2a3550', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  treatyTxt: { color: '#cdd6f4', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  msgWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 340 },
  msg: { backgroundColor: '#33384a', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#33384a', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, marginRight: 6 },
  chatBtn: { backgroundColor: '#4c7dff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginTop: 8, alignSelf: 'flex-start' },
  chatBtnTxt: { color: '#fff', fontWeight: '700' },
  accept: { backgroundColor: '#46a35a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginLeft: 6 },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  txt: { color: '#e8e8e8', fontSize: 13 },
  dim: { color: '#aaa', fontSize: 12, marginBottom: 4 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
