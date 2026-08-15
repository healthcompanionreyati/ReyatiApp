import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import AuthExperience from "./AuthExperience";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const user = await getChatGPTUser();
  return <AuthExperience user={user ? { email: user.email, fullName: user.fullName } : null} signInPath={chatGPTSignInPath("/auth")} signOutPath={chatGPTSignOutPath("/")}/>;
}
