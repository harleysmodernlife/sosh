import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import type { Pulse } from '@/lib/types';

type InviteRecord = {
  id: string;
  code: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  used_by_username: string | null;
};

export default function AdminScreen() {
  const [activePulse, setActivePulse] = useState<Pulse | null>(null);
  const [loadingPulse, setLoadingPulse] = useState(true);
  const [schedule, setSchedule] = useState<{ enabled: boolean; cron: string | null; next_run: string | null } | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [togglingSchedule, setTogglingSchedule] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [city, setCity] = useState('');
  const [submissionMins, setSubmissionMins] = useState('15');
  const [votingHours, setVotingHours] = useState('2');
  const [firing, setFiring] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteLabel, setInviteLabel] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);

  const [postReports, setPostReports] = useState<any[]>([]);
  const [userReports, setUserReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const loadActive = useCallback(async () => {
    setLoadingPulse(true);
    try {
      const p = await api.pulses.active();
      setActivePulse(p);
    } catch {
      setActivePulse(null);
    } finally {
      setLoadingPulse(false);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    setLoadingSchedule(true);
    try {
      const s = await api.admin.getSchedule();
      setSchedule(s);
    } catch {
      setSchedule(null);
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      setInvites(await api.invites.list());
    } catch {
      setInvites([]);
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    loadActive();
    loadSchedule();
    loadInvites();
    Promise.all([api.reports.adminPosts(), api.reports.adminUsers()])
      .then(([pr, ur]) => { setPostReports(pr); setUserReports(ur); })
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, [loadActive, loadSchedule, loadInvites]);

  async function handleCreateInvite() {
    setCreatingInvite(true);
    try {
      const invite = await api.invites.create(inviteLabel.trim() || undefined);
      setInviteLabel('');
      await loadInvites();
      Alert.alert(
        'Invite created',
        `Code: ${invite.code}\n\nShare this with ${invite.label ?? 'your guest'}. It expires in 30 days.`,
        [
          { text: 'Copy code', onPress: () => Clipboard.setStringAsync(invite.code) },
          { text: 'OK' },
        ],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create invite');
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleFire() {
    if (!prompt.trim()) {
      Alert.alert('Prompt required', 'Enter a prompt for the Pulse.');
      return;
    }
    const mins = parseInt(submissionMins, 10);
    const hours = parseInt(votingHours, 10);
    if (isNaN(mins) || mins < 5 || mins > 60) {
      Alert.alert('Invalid window', 'Submission window must be 5–60 minutes.');
      return;
    }
    if (isNaN(hours) || hours < 1 || hours > 24) {
      Alert.alert('Invalid window', 'Voting window must be 1–24 hours.');
      return;
    }
    setFiring(true);
    try {
      const fired = await api.admin.firePulse({
        prompt: prompt.trim(),
        submission_window_minutes: mins,
        voting_window_hours: hours,
        city: city.trim() || undefined,
      });
      setPrompt('');
      setCity('');
      Alert.alert('Pulse fired', `"${fired.prompt}"\n\nSubmissions close in ${mins}m, voting ends ${hours}h later.`);
      await loadActive();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to fire Pulse');
    } finally {
      setFiring(false);
    }
  }

  async function handleToggleSchedule() {
    setTogglingSchedule(true);
    try {
      if (schedule?.enabled) {
        await api.admin.deleteSchedule();
        setSchedule({ enabled: false, cron: null, next_run: null });
      } else {
        // Default: 18:00 UTC daily = 1pm CDT
        const updated = await api.admin.setSchedule('0 18 * * *');
        setSchedule(updated);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update schedule');
    } finally {
      setTogglingSchedule(false);
    }
  }

  async function handleResolve() {
    if (!activePulse) return;
    Alert.alert(
      'Resolve now?',
      `This will immediately end "${activePulse.prompt}" and calculate the winner.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            setResolving(true);
            try {
              await api.admin.resolvePulse(activePulse.id);
              Alert.alert('Done', 'Resolution job enqueued. Check home tab in a moment.');
              await loadActive();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to resolve');
            } finally {
              setResolving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Admin Panel</Text>
        </View>

        {/* Active Pulse */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACTIVE PULSE</Text>
          {loadingPulse ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
          ) : activePulse ? (
            <View style={styles.activePulseCard}>
              <Text style={styles.activePulseStatus}>
                {activePulse.status.toUpperCase()}
                {activePulse.city ? `  ·  ${activePulse.city}` : ''}
              </Text>
              <Text style={styles.activePulsePrompt}>"{activePulse.prompt}"</Text>
              <TouchableOpacity
                style={[styles.resolveBtn, resolving && styles.btnDisabled]}
                onPress={handleResolve}
                disabled={resolving}
              >
                {resolving ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.resolveBtnText}>Resolve Now</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active Pulse</Text>
            </View>
          )}
        </View>

        {/* Daily Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DAILY SCHEDULE</Text>
          {loadingSchedule ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
          ) : (
            <View style={styles.scheduleCard}>
              <View style={styles.scheduleRow}>
                <View>
                  <Text style={[styles.scheduleStatus, schedule?.enabled ? styles.scheduleOn : styles.scheduleOff]}>
                    {schedule?.enabled ? 'ENABLED' : 'DISABLED'}
                  </Text>
                  {schedule?.enabled && schedule.next_run && (
                    <Text style={styles.scheduleNext}>
                      Next: {new Date(schedule.next_run).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                    </Text>
                  )}
                  {schedule?.enabled && (
                    <Text style={styles.scheduleCron}>
                      {schedule.cron ?? '0 18 * * *'}  ·  18:00 UTC daily (1pm CDT)
                    </Text>
                  )}
                  {!schedule?.enabled && (
                    <Text style={styles.scheduleCron}>Fires at 18:00 UTC daily when enabled</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.scheduleToggleBtn, schedule?.enabled ? styles.scheduleToggleOff : styles.scheduleToggleOn, togglingSchedule && styles.btnDisabled]}
                  onPress={handleToggleSchedule}
                  disabled={togglingSchedule}
                >
                  {togglingSchedule ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text style={styles.scheduleToggleText}>{schedule?.enabled ? 'Disable' : 'Enable'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Fire new Pulse */}
        {!activePulse && !loadingPulse && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FIRE A PULSE</Text>

            <View style={styles.field}>
              <Text style={styles.label}>PROMPT</Text>
              <TextInput
                style={styles.promptInput}
                placeholder="What's everyone doing right now?"
                placeholderTextColor="#444"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{prompt.length}/200</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>CITY (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Nashville"
                placeholderTextColor="#444"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                maxLength={100}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>SUBMISSION (min)</Text>
                <TextInput
                  style={styles.input}
                  value={submissionMins}
                  onChangeText={setSubmissionMins}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>VOTING (hrs)</Text>
                <TextInput
                  style={styles.input}
                  value={votingHours}
                  onChangeText={setVotingHours}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.fireBtn, (!prompt.trim() || firing) && styles.btnDisabled]}
              onPress={handleFire}
              disabled={!prompt.trim() || firing}
            >
              {firing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.fireBtnText}>Fire Pulse</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {/* Invites */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INVITES</Text>

          <View style={styles.inviteCreateRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Label (e.g. Heather)"
              placeholderTextColor="#444"
              value={inviteLabel}
              onChangeText={setInviteLabel}
              autoCapitalize="words"
              maxLength={50}
            />
            <TouchableOpacity
              style={[styles.createInviteBtn, creatingInvite && styles.btnDisabled]}
              onPress={handleCreateInvite}
              disabled={creatingInvite}
            >
              {creatingInvite ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.createInviteBtnText}>Generate</Text>
              )}
            </TouchableOpacity>
          </View>

          {loadingInvites ? (
            <ActivityIndicator color="#555" />
          ) : invites.length === 0 ? (
            <Text style={styles.emptyText}>No invite codes yet.</Text>
          ) : (
            invites.map(inv => (
              <TouchableOpacity
                key={inv.id}
                style={styles.inviteRow}
                onPress={() => Clipboard.setString(inv.code)}
                activeOpacity={0.7}
              >
                <View style={styles.inviteLeft}>
                  <Text style={styles.inviteCode}>{inv.code}</Text>
                  {inv.label && <Text style={styles.inviteLabel}>{inv.label}</Text>}
                </View>
                <Text style={[
                  styles.inviteStatus,
                  inv.used_at ? styles.inviteUsed : styles.inviteAvailable,
                ]}>
                  {inv.used_at
                    ? `Used · @${inv.used_by_username ?? '?'}`
                    : 'Available'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Reports */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REPORTS</Text>
          {loadingReports ? (
            <ActivityIndicator color="#555" />
          ) : postReports.length === 0 && userReports.length === 0 ? (
            <Text style={styles.emptyText}>No reports.</Text>
          ) : (
            <>
              {postReports.map((r, i) => (
                <View key={r.post_id ?? i} style={styles.reportRow}>
                  <Text style={styles.reportType}>POST</Text>
                  <View style={styles.reportBody}>
                    <Text style={styles.reportText} numberOfLines={2}>{r.text_content ?? `[${r.content_type}]`}</Text>
                    <Text style={styles.reportMeta}>by @{r.post_author_username} · {r.report_count} report{r.report_count !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.reportActions}>
                    <TouchableOpacity
                      style={styles.reportDismiss}
                      onPress={() => setPostReports(prev => prev.filter((_, j) => j !== i))}
                    >
                      <Text style={styles.reportDismissText}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.reportDelete}
                      onPress={() => Alert.alert('Delete post?', 'This removes the post permanently.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          try {
                            await api.admin.deletePost(r.post_id);
                            setPostReports(prev => prev.filter((_, j) => j !== i));
                          } catch (e: any) { Alert.alert('Error', e.message); }
                        }},
                      ])}
                    >
                      <Text style={styles.reportDeleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {userReports.map((r, i) => (
                <View key={r.reported_user_id ?? i} style={styles.reportRow}>
                  <Text style={styles.reportType}>USER</Text>
                  <View style={styles.reportBody}>
                    <Text style={styles.reportText}>@{r.reported_username}</Text>
                    <Text style={styles.reportMeta}>{r.report_count} report{r.report_count !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.reportActions}>
                    <TouchableOpacity
                      style={styles.reportDismiss}
                      onPress={() => setUserReports(prev => prev.filter((_, j) => j !== i))}
                    >
                      <Text style={styles.reportDismissText}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.reportDelete}
                      onPress={() => Alert.alert(`Ban @${r.reported_username}?`, 'This permanently deletes their account and all data. Cannot be undone.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Ban', style: 'destructive', onPress: async () => {
                          try {
                            await api.admin.banUser(r.reported_user_id);
                            setUserReports(prev => prev.filter((_, j) => j !== i));
                            Alert.alert('Done', `@${r.reported_username} has been banned.`);
                          } catch (e: any) { Alert.alert('Error', e.message); }
                        }},
                      ])}
                    >
                      <Text style={styles.reportDeleteText}>Ban</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 60, gap: 32, paddingBottom: 48 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  back: { color: '#555', fontSize: 15 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },

  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 3 },

  activePulseCard: {
    backgroundColor: '#0f0f0f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    padding: 18,
    gap: 10,
  },
  activePulseStatus: { fontSize: 11, fontWeight: '700', color: '#ff4444', letterSpacing: 2 },
  activePulsePrompt: { fontSize: 18, fontWeight: '700', color: '#fff', lineHeight: 24 },

  resolveBtn: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  resolveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 20,
    alignItems: 'center',
  },
  emptyText: { color: '#333', fontSize: 14 },

  field: { gap: 6 },
  label: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 3 },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  promptInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: '#333', textAlign: 'right' },

  row: { flexDirection: 'row', gap: 12 },

  scheduleCard: {
    backgroundColor: '#0f0f0f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
  },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  scheduleStatus: { fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  scheduleOn: { color: '#4caf50' },
  scheduleOff: { color: '#555' },
  scheduleNext: { fontSize: 13, color: '#aaa', marginBottom: 2 },
  scheduleCron: { fontSize: 11, color: '#444' },
  scheduleToggleBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  scheduleToggleOn: { backgroundColor: '#4caf50' },
  scheduleToggleOff: { backgroundColor: '#333' },
  scheduleToggleText: { color: '#000', fontWeight: '700', fontSize: 13 },

  fireBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  fireBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.35 },

  inviteCreateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  createInviteBtn: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  createInviteBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  inviteRow: { backgroundColor: '#0f0f0f', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inviteLeft: { gap: 3 },
  inviteCode: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 3 },
  inviteLabel: { fontSize: 12, color: '#555' },
  inviteStatus: { fontSize: 12, fontWeight: '600' },
  inviteUsed: { color: '#444' },
  inviteAvailable: { color: '#4caf50' },

  reportRow: { flexDirection: 'row', gap: 10, backgroundColor: '#0f0f0f', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', padding: 12, alignItems: 'center' },
  reportType: { fontSize: 9, fontWeight: '900', color: '#555', letterSpacing: 2, paddingTop: 2, width: 36 },
  reportBody: { flex: 1, gap: 3 },
  reportText: { fontSize: 13, color: '#ccc' },
  reportMeta: { fontSize: 11, color: '#555' },
  reportReason: { fontSize: 11, color: '#666', fontStyle: 'italic' },
  reportActions: { gap: 6, alignItems: 'flex-end' },
  reportDismiss: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  reportDismissText: { fontSize: 11, color: '#555', fontWeight: '600' },
  reportDelete: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#3a0000', borderWidth: 1, borderColor: '#600' },
  reportDeleteText: { fontSize: 11, color: '#ff4444', fontWeight: '700' },
});
