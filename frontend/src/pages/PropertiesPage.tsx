import { gql, useMutation, useQuery } from "@apollo/client";
import { FormEvent, useState } from "react";

const LIST = gql`
  query MyProperties($status: PropertyStatus, $page: Int) {
    myProperties(filters: { status: $status, page: $page, pageSize: 20 }) {
      total
      items {
        id
        title
        description
        address
        city
        zipCode
        country
        type
        price
        surfaceM2
        bedrooms
        bathrooms
        status
        coListedAgentId
        createdAt
        viewCount
        openFlagCount
      }
    }
  }
`;

const CREATE = gql`
  mutation Create($input: PropertyInput!) {
    createProperty(input: $input) {
      id
    }
  }
`;

const UPDATE = gql`
  mutation Update($id: ID!, $input: PropertyInput!) {
    updateProperty(id: $id, input: $input) {
      id
    }
  }
`;

const REMOVE = gql`
  mutation Remove($id: ID!) {
    deleteProperty(id: $id)
  }
`;

const template = {
  title: "",
  description: "",
  address: "",
  city: "Zurich",
  zipCode: "8000",
  country: "Switzerland",
  type: "apartment",
  price: 500000,
  surfaceM2: 60,
  bedrooms: 2,
  bathrooms: 1,
  status: "DRAFT",
};

export function PropertiesPage() {
  const [status, setStatus] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(template);
  const { data, loading, refetch } = useQuery(LIST, {
    variables: { status: status || null, page: 1 },
  });
  const [createProperty] = useMutation(CREATE);
  const [updateProperty] = useMutation(UPDATE);
  const [deleteProperty] = useMutation(REMOVE);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.coListedAgentId) {
      delete payload.coListedAgentId;
    }
    if (editingId) {
      await updateProperty({ variables: { id: editingId, input: payload } });
    } else {
      await createProperty({ variables: { input: payload } });
    }
    setForm(template);
    setEditingId(null);
    await refetch();
  };

  return (
    <div className="stack">
      <section className="panel">
        <h3>{editingId ? "Edit property" : "Add property"}</h3>
        <form onSubmit={submit} className="grid-form">
          {Object.keys(template).map((k) => (
            <input
              key={k}
              value={String(form[k] ?? "")}
              onChange={(e) =>
                setForm((prev: any) => ({
                  ...prev,
                  [k]:
                    ["price", "surfaceM2", "bedrooms", "bathrooms"].includes(k)
                      ? Number(e.target.value)
                      : e.target.value,
                }))
              }
              placeholder={k}
            />
          ))}
          <button type="submit">{editingId ? "Save" : "Add Property"}</button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(template); }}>
              Cancel
            </button>
          )}
        </form>
      </section>

      <section className="panel">
        <div className="row-between">
          <h3>Properties</h3>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="SOLD">Sold</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        {loading ? (
          <p>Loading properties...</p>
        ) : (
          <table>
            <thead>
              <tr><th>Title</th><th>Price</th><th>Status</th><th>Views</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.myProperties.items.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    {p.title}
                    {p.openFlagCount > 0 ? <span className="badge">Flagged</span> : null}
                  </td>
                  <td>CHF {Number(p.price).toLocaleString()}</td>
                  <td>{p.status}</td>
                  <td>{p.viewCount}</td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => {
                        setEditingId(p.id);
                        setForm({
                          ...template,
                          title: p.title,
                          description: p.description,
                          address: p.address,
                          city: p.city,
                          zipCode: p.zipCode,
                          country: p.country,
                          type: p.type,
                          price: Number(p.price),
                          surfaceM2: Number(p.surfaceM2),
                          bedrooms: p.bedrooms,
                          bathrooms: p.bathrooms,
                          status: p.status,
                          coListedAgentId: p.coListedAgentId ?? "",
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this property?")) return;
                        await deleteProperty({ variables: { id: p.id } });
                        await refetch();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
