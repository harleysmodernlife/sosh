import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';

type Tab = 'terms' | 'privacy';

export default function LegalScreen() {
  const [tab, setTab] = useState<Tab>('terms');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Legal</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'terms' && styles.tabActive]}
          onPress={() => setTab('terms')}
        >
          <Text style={[styles.tabText, tab === 'terms' && styles.tabTextActive]}>
            Terms of Service
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'privacy' && styles.tabActive]}
          onPress={() => setTab('privacy')}
        >
          <Text style={[styles.tabText, tab === 'privacy' && styles.tabTextActive]}>
            Privacy Policy
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
      </ScrollView>
    </View>
  );
}

function TermsContent() {
  return (
    <>
      <Text style={styles.lastUpdated}>Last updated: September 2026</Text>

      <Section title="1. Acceptance">
        By creating an account or using Sösh, you agree to these Terms of Service. If you do not
        agree, do not use the app. You must be 13 years of age or older to use Sösh.
      </Section>

      <Section title="2. The Service">
        Sösh is a social media platform built around synchronized real-time events called Pulses.
        Users submit photo, video, or text responses to a shared prompt and vote on each other's
        entries. Winners earn trophies and recognition within their city.
      </Section>

      <Section title="3. Your Account">
        You are responsible for keeping your account credentials secure. You may not share your
        account or use another person's account. You must provide accurate information during
        onboarding and keep it up to date.
      </Section>

      <Section title="4. Content You Submit">
        You retain ownership of content you create. By submitting content to Sösh, you grant us a
        non-exclusive, worldwide, royalty-free license to display, distribute, and promote that
        content within the app and in connection with Sösh's marketing.

        {'\n\n'}You must not submit content that:
        {'\n'}• Violates any law or regulation
        {'\n'}• Contains nudity, sexual content, or graphic violence
        {'\n'}• Harasses, threatens, or demeans any person
        {'\n'}• Infringes on another person's intellectual property
        {'\n'}• Is spam or artificially inflates votes
      </Section>

      <Section title="5. Moderation">
        We reserve the right to remove any content that violates these terms, without prior notice.
        Repeat violations may result in account suspension or permanent termination.
      </Section>

      <Section title="6. Voting Integrity">
        Vote manipulation — including the use of bots, multiple accounts, or coordinated voting
        schemes — is strictly prohibited and will result in disqualification and account termination.
      </Section>

      <Section title="7. Disclaimers">
        Sösh is provided "as is" without warranties of any kind. We do not guarantee uninterrupted
        service, accuracy of leaderboards, or delivery of push notifications. We are not liable for
        any indirect or consequential damages arising from your use of the app.
      </Section>

      <Section title="8. Changes">
        We may update these terms at any time. Continued use of Sösh after changes constitutes
        acceptance of the new terms. We will make reasonable efforts to notify you of material
        changes via in-app notice.
      </Section>

      <Section title="9. Contact">
        Questions about these terms? Reach us at legal@sosh.app
      </Section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <Text style={styles.lastUpdated}>Last updated: September 2026</Text>

      <Section title="1. What We Collect">
        <Text style={styles.body}>
          When you use Sösh, we collect:
          {'\n'}• Email address (via Supabase Auth)
          {'\n'}• Username and city you provide during onboarding
          {'\n'}• Profile photo, if you choose to upload one
          {'\n'}• Content you submit (photos, videos, text)
          {'\n'}• Votes you cast
          {'\n'}• Device push notification token (for Pulse alerts)
          {'\n'}• Basic usage data (which Pulses you viewed or entered)
        </Text>
      </Section>

      <Section title="2. How We Use It">
        We use your information to:
        {'\n'}• Operate the Pulse events and leaderboards
        {'\n'}• Send push notifications (new Pulses, vote milestones, results)
        {'\n'}• Display your public profile and entry history
        {'\n'}• Detect and prevent fraud and abuse
        {'\n'}• Improve the app
      </Section>

      <Section title="3. What We Share">
        Your username, city, profile photo, and submitted entries are visible to all Sösh users.
        Your email address is never shown publicly.

        {'\n\n'}We do not sell your personal data. We do not share it with advertisers.

        {'\n\n'}We use the following third-party services, each with their own privacy policies:
        {'\n'}• Supabase — authentication and database (supabase.com/privacy)
        {'\n'}• Expo — push notification delivery (expo.dev/privacy)
        {'\n'}• Railway — server infrastructure (railway.app/legal/privacy)
        {'\n'}• Upstash — Redis caching (upstash.com/trust/privacy)
      </Section>

      <Section title="4. Data Retention">
        Your account data is retained until you delete your account. Submitted entries and votes
        remain associated with resolved Pulses for leaderboard history. You may request deletion
        of your account and associated data by contacting us.
      </Section>

      <Section title="5. Security">
        We use industry-standard practices to protect your data, including TLS in transit and
        encrypted credentials at rest via Supabase. No method of transmission is 100% secure;
        we cannot guarantee absolute security.
      </Section>

      <Section title="6. Children">
        Sösh is not directed at children under 13. We do not knowingly collect data from children
        under 13. If you believe a child has provided us with their data, contact us immediately.
      </Section>

      <Section title="7. Your Rights">
        Depending on your location, you may have rights to access, correct, or delete your personal
        data. To exercise these rights, contact us at privacy@sosh.app
      </Section>

      <Section title="8. Changes">
        We may update this policy. We will notify you of material changes via in-app notice.
        Continued use of Sösh after changes constitutes acceptance of the updated policy.
      </Section>

      <Section title="9. Contact">
        Privacy questions? Contact privacy@sosh.app
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  backBtn: { width: 60 },
  backText: { color: '#fff', fontSize: 15 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 1 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#fff',
  },
  tabText: { color: '#555', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  tabTextActive: { color: '#fff' },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  lastUpdated: { color: '#444', fontSize: 12, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  body: { color: '#888', fontSize: 14, lineHeight: 22 },
});
