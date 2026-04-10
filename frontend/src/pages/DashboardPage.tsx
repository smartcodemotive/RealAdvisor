import { gql, useMutation, useQuery } from "@apollo/client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DASHBOARD = gql`
  query Dashboard {
    me {
      name
    }
    dashboardStats {
      totalViewsLast30Days
      recentSalesCount
      averageDaysToSell
      statusCounts {
        status
        count
      }
      topViewedProperties {
        views
        property {
          id
          title
          status
        }
      }
      viewsByDayLast30Days {
        date
        views
      }
    }
    flaggedProperties(pageSize: 5) {
      id
      confidence
      ruleCode
      reasons
      propertyId
      property {
        id
        title
        status
      }
    }
  }
`;

const DISMISS = gql`
  mutation Dismiss($flagId: ID!, $reason: String!) {
    dismissFlag(flagId: $flagId, reason: $reason) {
      id
    }
  }
`;

const CONFIRM = gql`
  mutation Confirm($flagId: ID!, $reason: String!) {
    confirmFlagAsScam(flagId: $flagId, reason: $reason) {
      id
    }
  }
`;

export function DashboardPage() {
  const { data, loading, error, refetch } = useQuery(DASHBOARD);
  const [dismissFlag] = useMutation(DISMISS);
  const [confirmFlag] = useMutation(CONFIRM);
  if (loading) return <p>Loading dashboard...</p>;
  if (error) return <p className="error">{error.message}</p>;

  const activeCount =
    data.dashboardStats.statusCounts.find((s: any) => s.status === "ACTIVE")?.count ?? 0;

  return (
    <div className="stack">
      <h2>Welcome back, {data.me?.name ?? "Agent"}.</h2>
      <div className="cards">
        <StatCard label="Total active properties" value={activeCount} />
        <StatCard label="Total views (this month)" value={data.dashboardStats.totalViewsLast30Days} />
        <StatCard label="Properties sold (this month)" value={data.dashboardStats.recentSalesCount} />
        <StatCard label="Average days to sell" value={data.dashboardStats.averageDaysToSell.toFixed(1)} />
      </div>
      <section className="panel">
        <h3>Views over time (last 30 days)</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={data.dashboardStats.viewsByDayLast30Days}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="views" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel">
        <h3>Top 5 most viewed properties</h3>
        <table>
          <thead>
            <tr><th>Title</th><th>Status</th><th>Views</th></tr>
          </thead>
          <tbody>
            {data.dashboardStats.topViewedProperties.map((row: any) => (
              <tr key={row.property.id}>
                <td>{row.property.title}</td>
                <td>{row.property.status}</td>
                <td>{row.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h3>Flagged listings</h3>
        {data.flaggedProperties.length === 0 ? (
          <p>No open flags.</p>
        ) : (
          data.flaggedProperties.map((flag: any) => (
            <div key={flag.id} className="flag-row">
              <div>
                <div>
                  <strong>{flag.property.title}</strong> ({flag.property.status})
                </div>
                <strong>{flag.ruleCode}</strong> ({flag.confidence}%):{" "}
                {Array.isArray(flag.reasons) ? flag.reasons.join(", ") : String(flag.reasons)}
              </div>
              <div>
                <button onClick={async () => { await dismissFlag({ variables: { flagId: flag.id, reason: "Reviewed and valid listing" } }); await refetch(); }}>Dismiss</button>
                <button onClick={async () => { await confirmFlag({ variables: { flagId: flag.id, reason: "Confirmed suspicious" } }); await refetch(); }}>Confirm scam</button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel">
      <p>{label}</p>
      <h3>{value}</h3>
    </div>
  );
}
