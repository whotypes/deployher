import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useMemo } from "react";
import { resolveMarketingSiteCompatHref } from "@/lib/marketingDashOrigin";

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
  return (target: NavigateTarget, options: RouterNavigateOptions = {}) => {
    const url =
      typeof target === "string"
        ? resolveMarketingSiteCompatHref(target)
        : `${resolveMarketingSiteCompatHref(target.pathname ?? ".")}${target.search ?? ""}`;
    if (options.replace) {
      window.location.replace(url);
    } else {
      window.location.assign(url);
    }
  };
};

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children?: ReactNode;
};

export const Link = ({ to, children, ...props }: LinkProps) => (
  <a href={resolveMarketingSiteCompatHref(to)} {...props}>
    {children}
  </a>
);

export const useParams = <
  TParams extends Record<string, string | undefined> = Record<string, string | undefined>,
>() => ({}) as TParams;

export const useSearchParams = (): [
  URLSearchParams,
  (next: SetSearchParamsAction, options?: RouterNavigateOptions) => void,
] => {
  const searchParams = useMemo(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
    [],
  );
  const setWrapped = (_next: SetSearchParamsAction, _options: RouterNavigateOptions = {}) => {};
  return [searchParams, setWrapped];
};

export const useLocation = () =>
  useMemo(
    () => ({
      pathname: typeof window !== "undefined" ? window.location.pathname : "/",
      search: typeof window !== "undefined" ? window.location.search : "",
      hash: typeof window !== "undefined" ? window.location.hash : "",
      state: null as unknown,
      key: "default",
    }),
    [],
  );
