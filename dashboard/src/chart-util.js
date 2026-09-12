/**
 * Chart rendering utility using Chart.js
 */

import Chart from 'chart.js/auto';

let chartInstance = null;

export function renderProductivityChart(submissions) {
  const ctx = document.getElementById('productivityChart');
  if (!ctx) return;

  // Aggregate submissions by hour of the day (00:00 to 23:00)
  const hourlyCounts = new Array(24).fill(0);

  submissions.forEach(sub => {
    if (!sub.timestamp) return;
    try {
      const date = new Date(sub.timestamp);
      const hour = date.getHours();
      hourlyCounts[hour]++;
    } catch (e) {
      // Ignore invalid date
    }
  });

  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  if (chartInstance) {
    chartInstance.data.datasets[0].data = hourlyCounts;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Submissions per Hour',
        data: hourlyCounts,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#38bdf8',
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#161b22',
          titleColor: '#f0f6fc',
          bodyColor: '#38bdf8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#8b949e',
            font: { size: 11 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#8b949e',
            font: { size: 11 }
          },
          beginAtZero: true
        }
      }
    }
  });
}
