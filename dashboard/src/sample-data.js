/**
 * Generates realistic seed submissions and skips for Rooya AI Dashboard preview mode.
 */

export function generateSampleSubmissions() {
  const users = [
    { userName: 'farhan.sadik@rooya.ai', pcId: 'PC-01', baseTodaySubmits: 387, baseTodaySkips: 42, totalSubmits: 4821 },
    { userName: 'user2@rooya.ai',        pcId: 'PC-02', baseTodaySubmits: 421, baseTodaySkips: 58, totalSubmits: 5120 },
    { userName: 'user3@rooya.ai',        pcId: 'PC-03', baseTodaySubmits: 356, baseTodaySkips: 31, totalSubmits: 3980 },
    { userName: 'sarah.connor@rooya.ai', pcId: 'PC-04', baseTodaySubmits: 290, baseTodaySkips: 19, totalSubmits: 2150 },
    { userName: 'alex.mercer@rooya.ai',  pcId: 'PC-05', baseTodaySubmits: 185, baseTodaySkips: 12, totalSubmits: 1420 }
  ];

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const submissions = [];

  users.forEach((u) => {
    // Generate Submits
    for (let i = 0; i < u.baseTodaySubmits; i++) {
      const minuteOffset = Math.floor(Math.random() * 600);
      const timestamp = new Date(now.getTime() - minuteOffset * 60 * 1000).toISOString();
      submissions.push({
        id: `mock-sub-${u.pcId}-${i}`,
        userName: u.userName,
        userId: u.userName.split('@')[0],
        pcId: u.pcId,
        timestamp: timestamp,
        date: todayStr,
        action: 'submit'
      });
    }

    // Generate Skips
    for (let i = 0; i < u.baseTodaySkips; i++) {
      const minuteOffset = Math.floor(Math.random() * 600);
      const timestamp = new Date(now.getTime() - minuteOffset * 60 * 1000).toISOString();
      submissions.push({
        id: `mock-skip-${u.pcId}-${i}`,
        userName: u.userName,
        userId: u.userName.split('@')[0],
        pcId: u.pcId,
        timestamp: timestamp,
        date: todayStr,
        action: 'skip'
      });
    }

    // Previous days
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    for (let i = 0; i < 150; i++) {
      submissions.push({
        id: `mock-prev-${u.pcId}-${i}`,
        userName: u.userName,
        userId: u.userName.split('@')[0],
        pcId: u.pcId,
        timestamp: yesterday.toISOString(),
        date: yesterdayStr,
        action: (i % 8 === 0) ? 'skip' : 'submit'
      });
    }
  });

  return submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
