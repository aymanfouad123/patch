export type PatchAuthUser = {
  name?: string;
  image?: string | null;
};

export type PatchAuth =
  | { status: "loading" }
  | { status: "signedOut"; signIn: () => void | Promise<void> }
  | { status: "unauthorized"; signOut: () => void | Promise<void> }
  | {
      status: "authorized";
      signOut: () => void | Promise<void>;
      user?: PatchAuthUser;
    };
