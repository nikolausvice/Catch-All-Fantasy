// Placeholder Supabase database types.
// Regenerate with the Supabase CLI once the project is linked:
//   npx supabase gen types typescript --project-id <project-id> > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      connected_leagues: {
        Row: {
          id: string;
          user_id: string;
          platform: "sleeper" | "espn" | "yahoo";
          platform_league_id: string;
          platform_user_id: string | null;
          league_name: string;
          season: string;
          sport: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: "sleeper" | "espn" | "yahoo";
          platform_league_id: string;
          platform_user_id?: string | null;
          league_name: string;
          season: string;
          sport?: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform?: "sleeper" | "espn" | "yahoo";
          platform_league_id?: string;
          platform_user_id?: string | null;
          league_name?: string;
          season?: string;
          sport?: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      platform_identities: {
        Row: {
          id: string;
          user_id: string;
          platform: "sleeper" | "espn" | "yahoo";
          platform_user_id: string;
          platform_username: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: "sleeper" | "espn" | "yahoo";
          platform_user_id: string;
          platform_username?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform?: "sleeper" | "espn" | "yahoo";
          platform_user_id?: string;
          platform_username?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
