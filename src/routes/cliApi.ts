import { type RequestWithParamsAndSession } from "../auth/session";
import { json } from "../http/helpers";

export const getCliWhoamiApi = async (req: RequestWithParamsAndSession) => {
  return json({
    user: {
      id: req.session.user.id,
      name: req.session.user.name ?? null,
      email: req.session.user.email,
      image: req.session.user.image ?? null,
      role: req.session.user.role
    }
  });
};
