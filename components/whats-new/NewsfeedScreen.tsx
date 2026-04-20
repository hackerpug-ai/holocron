/**
 * NewsfeedScreen - Intelligence Briefing orchestrator
 *
 * Composes all four intelligence briefing components and wires them
 * with existing hooks for a complete What's New experience.
 */

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { FeedSkeleton } from '@/components/subscriptions/FeedSkeleton';
import { WebViewSheet } from '@/components/webview/WebViewSheet';
import { useWhatsNewFeed } from '@/hooks/use-whats-new-feed';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useWebView } from '@/hooks/useWebView';
import { NewsfeedFilterBar } from './NewsfeedFilterBar';
import { NewsfeedFindingCard } from './NewsfeedFindingCard';
import { NewsfeedHeader } from './NewsfeedHeader';
import { NewsfeedHeroCard } from './NewsfeedHeroCard';
import { SocialPostsGroupCard } from './SocialPostsGroupCard';

/** Check if a finding is from a social/community source */
function isSocialSource(source: string): boolean {
  return (
    source.startsWith('r/') ||
    source.includes('Bluesky') ||
    source === 'Lobsters' ||
    source === 'Dev.to' ||
    source === 'Twitter/X'
  );
}

/**
 * Maps the selectedCategory filter key to the hook's category argument.
 */
function toCategoryArg(key: string): 'discovery' | 'release' | 'trend' | 'discussion' | undefined {
  if (key === 'discovery' || key === 'release' || key === 'trend' || key === 'discussion') {
    return key;
  }
  return undefined;
}

interface NewsfeedScreenProps {
  testID?: string;
}

export const NewsfeedScreen = React.memo(function NewsfeedScreen({
  testID = 'newsfeed-screen',
}: NewsfeedScreenProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { findings, report, isLoading, isRefreshing, refresh } = useWhatsNewFeed({
    category: toCategoryArg(selectedCategory),
  });
  const { webViewState, openUrl, closeWebView } = useWebView();
  useOfflineQueue();

  // Separate social posts from non-social findings
  const { nonSocialFindings, socialFindings } = useMemo(() => {
    // When filtering to "discussion" category, show all individually
    if (selectedCategory === 'discussion') {
      return { nonSocialFindings: findings, socialFindings: [] };
    }
    const social: typeof findings = [];
    const nonSocial: typeof findings = [];
    for (const f of findings) {
      if (isSocialSource(f.source)) {
        social.push(f);
      } else {
        nonSocial.push(f);
      }
    }
    return { nonSocialFindings: nonSocial, socialFindings: social };
  }, [findings, selectedCategory]) as {
    nonSocialFindings: typeof findings;
    socialFindings: typeof findings;
  };

  // Filter options derived from report counts
  const discussionCount = report
    ? Math.max(
        0,
        (report.findingsCount ?? 0) -
          (report.discoveryCount ?? 0) -
          (report.releaseCount ?? 0) -
          (report.trendCount ?? 0)
      )
    : 0;

  const filterOptions = [
    { key: 'discovery', label: 'Discoveries', count: report?.discoveryCount ?? 0 },
    { key: 'release', label: 'Releases', count: report?.releaseCount ?? 0 },
    { key: 'trend', label: 'Trends', count: report?.trendCount ?? 0 },
    { key: 'discussion', label: 'Discussions', count: discussionCount },
  ];

  // Hero finding is the first non-social finding
  const heroFinding = nonSocialFindings[0];
  const remainingFindings = nonSocialFindings.slice(1);

  return (
    <>
      {/* Loading skeleton */}
      {isLoading ? (
        <View testID={testID} className="flex-1 bg-background">
          <FeedSkeleton count={5} testID={`${testID}-loading`} />
        </View>
      ) : (
        <FlatList
          testID={testID}
          data={remainingFindings}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 16 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View className="pb-4">
              <NewsfeedHeader report={report} />

              <NewsfeedFilterBar
                options={filterOptions}
                selected={selectedCategory}
                onChange={setSelectedCategory}
                testID={`${testID}-filter-bar`}
              />

              {/* Hero card */}
              {heroFinding && (
                <View className="mt-4">
                  <NewsfeedHeroCard
                    title={heroFinding.title}
                    url={heroFinding.url}
                    source={heroFinding.source}
                    category={heroFinding.category}
                    score={heroFinding.score}
                    summary={heroFinding.summary}
                    publishedAt={heroFinding.publishedAt}
                    author={heroFinding.author}
                    engagementVelocity={heroFinding.engagementVelocity}
                    testID={`${testID}-hero-card`}
                    onPress={() => openUrl(heroFinding.url)}
                  />
                </View>
              )}

              {/* Social posts group card */}
              {socialFindings.length > 0 && (
                <View className="mt-4">
                  <SocialPostsGroupCard
                    findings={socialFindings}
                    onPress={() => router.push('/whats-new/social')}
                    testID={`${testID}-social-group`}
                  />
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <NewsfeedFindingCard
              title={item.title}
              url={item.url}
              source={item.source}
              category={item.category}
              score={item.score}
              summary={item.summary}
              publishedAt={item.publishedAt}
              author={item.author}
              engagementVelocity={item.engagementVelocity}
              tags={item.tags}
              testID={`${testID}-finding-${index}`}
              onPress={() => openUrl(item.url)}
            />
          )}
          ListEmptyComponent={
            <View
              className="flex-1 px-8 py-16 items-center justify-center"
              testID={`${testID}-empty`}
            >
              <View />
            </View>
          }
        />
      )}

      <WebViewSheet
        visible={webViewState.visible}
        url={webViewState.url}
        onClose={closeWebView}
        testID={`${testID}-webview`}
      />
    </>
  );
});
