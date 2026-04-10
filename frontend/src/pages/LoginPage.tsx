import { gql, useMutation } from "@apollo/client";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      agent {
        id
        name
      }
    }
  }
`;

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("alice@demo.com");
  const [password, setPassword] = useState("password123");
  const [login, { loading, error }] = useMutation(LOGIN);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await login({ variables: { email, password } });
    localStorage.setItem("token", res.data.login.token);
    navigate("/");
  };

  return (
    <div className="centered-card">
      <form onSubmit={onSubmit}>
        <h2>Agent Login</h2>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
        />
        <button disabled={loading} type="submit">
          {loading ? "Signing in..." : "Login"}
        </button>
        {error && <p className="error">{error.message}</p>}
      </form>
    </div>
  );
}
