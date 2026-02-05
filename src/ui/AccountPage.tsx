import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser } from "./Layout";
import { Layout } from "./Layout";

export type AccountPageData = {
  user: LayoutUser;
  linkedAccounts: { providerId: string }[];
};

const providerLabel = (providerId: string): string => {
  if (providerId === "github") return "GitHub";
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
};

const AccountPage = ({ data }: { data: AccountPageData }) => (
  <Layout title="Account · Placeholder" currentPath="/account" user={data.user}>
    <h1 className="title">Account</h1>

    <div className="box">
      <h2 className="subtitle is-5">Profile</h2>
      <div className="level">
        <div className="level-left">
          <div className="level-item">
            {data.user.image ? (
              <img
                src={data.user.image}
                alt=""
                width={64}
                height={64}
                style={{ borderRadius: 8 }}
              />
            ) : null}
          </div>
          <div className="level-item">
            <div>
              <p className="title is-5">{data.user.name ?? data.user.email}</p>
              {data.user.name ? (
                <p className="subtitle is-6" style={{ color: "#888" }}>
                  {data.user.email}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="box">
      <h2 className="subtitle is-5">Linked accounts</h2>
      {data.linkedAccounts.length === 0 ? (
        <p style={{ color: "#666" }}>No linked accounts.</p>
      ) : (
        <ul>
          {data.linkedAccounts.map((acc) => (
            <li key={acc.providerId}>{providerLabel(acc.providerId)}</li>
          ))}
        </ul>
      )}
    </div>

    <div className="box">
      <h2 className="subtitle is-5">Danger zone</h2>
      <p className="mb-4" style={{ color: "#888" }}>
        Permanently delete your account and all associated data.
      </p>
      <form id="delete-account-form" method="post" action="/account/delete">
        <button type="submit" className="button is-danger" aria-label="Delete account permanently">
          Delete account
        </button>
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("delete-account-form")?.addEventListener("submit",function(e){e.preventDefault();if(!confirm("Delete your account and all data permanently? This cannot be undone."))return;fetch("/account/delete",{method:"POST",credentials:"include"}).then(function(){window.location.href="/login";});});`
        }}
      />
    </div>
  </Layout>
);

export const renderAccountPage = (data: AccountPageData) =>
  renderToReadableStream(<AccountPage data={data} />);
