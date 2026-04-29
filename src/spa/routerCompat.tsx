import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  Link as RRDLink,
  useLocation,
  useNavigate as useRRDNavigate,
  useParams as useRRDParams,
  useSearchParams as useRRDSearchParams,
} from "react-router-dom";

type NavigateTarget =
  | string
  | {
      pathname?: string;
      search?: string;
    };

type RouterNavigateOptions = {
  replace?: boolean;
};

type SetSearchParamsAction = URLSearchParams | ((prev: URLSearchParams) => URLSearchParams);

export const useNavigate = () => {
  const navigate = useRRDNavigate();
  return (target: NavigateTarget, options: RouterNavigateOptions = {}) => {
    if (typeof target === "string") {
      void navigate(target, { replace: options.replace });
      return;
    }
    const pathname = target.pathname ?? ".";
    const search = target.search ?? "";
    void navigate(
      { pathname, search: search.length > 0 ? search : undefined },
      { replace: options.replace },
    );
  };
};

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children?: ReactNode;
};

export const Link = ({ to, children, ...props }: LinkProps) => (
  <RRDLink to={to} {...props}>
    {children}
  </RRDLink>
);

export const useParams = <
  TParams extends Record<string, string | undefined> = Record<string, string | undefined>,
>() => useRRDParams() as TParams;

export const useSearchParams = (): [
  URLSearchParams,
  (next: SetSearchParamsAction, options?: RouterNavigateOptions) => void,
] => {
  const [searchParams, setSearchParams] = useRRDSearchParams();

  const setWrapped = (next: SetSearchParamsAction, options: RouterNavigateOptions = {}) => {
    const nextParams = typeof next === "function" ? next(searchParams) : next;
    setSearchParams(nextParams, { replace: options.replace });
  };

  return [searchParams, setWrapped];
};

export { useLocation };
