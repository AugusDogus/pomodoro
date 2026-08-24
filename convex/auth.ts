import Discord from "@auth/core/providers/discord";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous({
      profile() {
        return { isAnonymous: true, name: "Guest" };
      },
    }),
    Discord,
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId !== undefined && args.existingUserId !== null) {
        const name = typeof args.profile.name === "string" ? args.profile.name : undefined;
        const image = typeof args.profile.image === "string" ? args.profile.image : undefined;
        const email = typeof args.profile.email === "string" ? args.profile.email : undefined;
        await ctx.db.patch(args.existingUserId, {
          name,
          image,
          email,
          isAnonymous: false,
        });
        return args.existingUserId;
      }

      return await ctx.db.insert("users", {
        name: typeof args.profile.name === "string" ? args.profile.name : "Guest",
        image: typeof args.profile.image === "string" ? args.profile.image : undefined,
        email: typeof args.profile.email === "string" ? args.profile.email : undefined,
        isAnonymous: args.profile.isAnonymous === true,
      });
    },
  },
});
