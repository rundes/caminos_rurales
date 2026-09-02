export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      caminos: {
        Row: {
          estado_general: Database["public"]["Enums"]["estado_camino"] | null
          id: string
          municipio: string
          nombre_codigo: string
          ultima_actualizacion: string | null
        }
        Insert: {
          estado_general?: Database["public"]["Enums"]["estado_camino"] | null
          id?: string
          municipio: string
          nombre_codigo: string
          ultima_actualizacion?: string | null
        }
        Update: {
          estado_general?: Database["public"]["Enums"]["estado_camino"] | null
          id?: string
          municipio?: string
          nombre_codigo?: string
          ultima_actualizacion?: string | null
        }
        Relationships: []
      }
      fallas_deteccion: {
        Row: {
          created_at: string | null
          id: string
          latitud: number
          longitud: number
          relevamiento_id: string | null
          severidad: Database["public"]["Enums"]["nivel_severidad"]
          tipo_falla: Database["public"]["Enums"]["tipo_falla"]
          url_evidencia_imagen: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          latitud: number
          longitud: number
          relevamiento_id?: string | null
          severidad: Database["public"]["Enums"]["nivel_severidad"]
          tipo_falla: Database["public"]["Enums"]["tipo_falla"]
          url_evidencia_imagen?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          latitud?: number
          longitud?: number
          relevamiento_id?: string | null
          severidad?: Database["public"]["Enums"]["nivel_severidad"]
          tipo_falla?: Database["public"]["Enums"]["tipo_falla"]
          url_evidencia_imagen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fallas_deteccion_relevamiento_id_fkey"
            columns: ["relevamiento_id"]
            isOneToOne: false
            referencedRelation: "relevamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          created_at: string
          id: string
          municipio_id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Insert: {
          created_at?: string
          id: string
          municipio_id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Update: {
          created_at?: string
          id?: string
          municipio_id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Relationships: []
      }
      relevamientos: {
        Row: {
          camino_id: string | null
          fecha: string
          id: string
          metadata: Json | null
          origen_datos: Database["public"]["Enums"]["origen_datos"]
          procesado_ia: boolean | null
          usuario_id: string | null
        }
        Insert: {
          camino_id?: string | null
          fecha?: string
          id?: string
          metadata?: Json | null
          origen_datos: Database["public"]["Enums"]["origen_datos"]
          procesado_ia?: boolean | null
          usuario_id?: string | null
        }
        Update: {
          camino_id?: string | null
          fecha?: string
          id?: string
          metadata?: Json | null
          origen_datos?: Database["public"]["Enums"]["origen_datos"]
          procesado_ia?: boolean | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relevamientos_camino_id_fkey"
            columns: ["camino_id"]
            isOneToOne: false
            referencedRelation: "caminos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relevamientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      municipio_actual: { Args: never; Returns: string }
      rol_actual: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
    }
    Enums: {
      estado_camino: "bueno" | "regular" | "malo" | "intransitable"
      nivel_severidad: "baja" | "media" | "alta"
      origen_datos: "app_sensor" | "camara_dashcam" | "formulario"
      rol_usuario: "productor" | "municipio" | "auditor"
      tipo_falla:
        | "bache"
        | "carcava"
        | "acumulacion_agua"
        | "falta_alcantarilla"
        | "maleza_alta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_camino: ["bueno", "regular", "malo", "intransitable"],
      nivel_severidad: ["baja", "media", "alta"],
      origen_datos: ["app_sensor", "camara_dashcam", "formulario"],
      rol_usuario: ["productor", "municipio", "auditor"],
      tipo_falla: [
        "bache",
        "carcava",
        "acumulacion_agua",
        "falta_alcantarilla",
        "maleza_alta",
      ],
    },
  },
} as const
