import { renderToReadableStream } from "react-dom/server";
import type { ListObjectItem } from "../storage";
import { Layout } from "../ui/Layout";
import { formatBytes, formatDate } from "../utils/format";

export type FilesPageData = {
  files: ListObjectItem[];
  storageConfigured: boolean;
};

const scripts = `
  document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('upload-form');
    const submitBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const notification = document.getElementById('notification');
    
    function showNotification(message, type) {
      notification.textContent = message;
      notification.className = 'notification is-toast ' + type;
      notification.style.display = 'block';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 3000);
    }
    
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const file = fileInput.files[0];
      if (!file) {
        showNotification('Please select a file', 'is-warning');
        return;
      }
      
      submitBtn.classList.add('is-loading');
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch('/files/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok && response.status !== 303) {
          throw new Error('Upload failed');
        }
        
        showNotification('File uploaded!', 'is-success');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showNotification(err.message, 'is-danger');
      } finally {
        submitBtn.classList.remove('is-loading');
      }
    });
  });
`;

const FilesPage = ({ data }: { data: FilesPageData }) => (
  <Layout title="Files · Placeholder" currentPath="/files" scripts={data.storageConfigured ? scripts : undefined}>
    <div id="notification" className="notification is-toast" style={{ display: "none" }} />

    <h1 className="title">Files</h1>

    {!data.storageConfigured ? (
      <div className="box">
        <p style={{ color: "#f5a623" }}>
          <strong>S3 storage is not configured.</strong>
        </p>
        <p className="mt-2" style={{ color: "#888" }}>
          Set the following environment variables:
        </p>
        <ul className="mt-2" style={{ color: "#888" }}>
          <li>
            <code>S3_ENDPOINT</code>
          </li>
          <li>
            <code>S3_BUCKET</code>
          </li>
          <li>
            <code>S3_ACCESS_KEY_ID</code>
          </li>
          <li>
            <code>S3_SECRET_ACCESS_KEY</code>
          </li>
        </ul>
      </div>
    ) : (
      <div className="columns">
        <div className="column is-8">
          <div className="box">
            <h3 className="subtitle is-5">Bucket Contents</h3>
            {data.files.length === 0 ? (
              <p style={{ color: "#666" }}>No files in bucket.</p>
            ) : (
              <table className="table is-fullwidth is-hoverable">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.files.map((f) => (
                    <tr key={f.key}>
                      <td style={{ wordBreak: "break-all" }}>
                        <code style={{ fontSize: "0.8125rem" }}>{f.key}</code>
                      </td>
                      <td style={{ color: "#888" }}>{formatBytes(f.size)}</td>
                      <td style={{ color: "#888" }}>{formatDate(f.lastModified)}</td>
                      <td>
                        <a
                          href={`/files/download?key=${encodeURIComponent(f.key)}`}
                          className="button is-small is-link"
                          aria-label={`Download ${f.key}`}
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="column is-4">
          <div className="box">
            <h3 className="subtitle is-5">Upload</h3>
            <form id="upload-form">
              <div className="field">
                <div className="control">
                  <input
                    id="file-input"
                    className="input"
                    type="file"
                    name="file"
                    required
                    aria-label="Choose file to upload"
                  />
                </div>
              </div>

              <div className="field">
                <div className="control">
                  <button id="upload-btn" type="submit" className="button is-success is-fullwidth">
                    Upload
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    )}
  </Layout>
);

export const renderFilesPage = (data: FilesPageData) =>
  renderToReadableStream(<FilesPage data={data} />);
