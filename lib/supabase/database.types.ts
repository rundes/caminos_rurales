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
      cobertura_tramos: {
        Row: {
          created_at: string
          id: string
          recorrido_id: string
          tramo_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          recorrido_id: string
          tramo_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          recorrido_id?: string
          tramo_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobertura_tramos_recorrido_id_fkey"
            columns: ["recorrido_id"]
            isOneToOne: false
            referencedRelation: "recorridos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobertura_tramos_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "tramos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobertura_tramos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fallas_deteccion: {
        Row: {
          created_at: string | null
          descripcion: string | null
          id: string
          latitud: number
          longitud: number
          recorrido_id: string | null
          severidad: Database["public"]["Enums"]["nivel_severidad"]
          tipo_falla: Database["public"]["Enums"]["tipo_falla"]
          url_evidencia_imagen: string | null
          url_evidencia_video: string | null
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          id?: string
          latitud: number
          longitud: number
          recorrido_id?: string | null
          severidad: Database["public"]["Enums"]["nivel_severidad"]
          tipo_falla: Database["public"]["Enums"]["tipo_falla"]
          url_evidencia_imagen?: string | null
          url_evidencia_video?: string | null
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          id?: string
          latitud?: number
          longitud?: number
          recorrido_id?: string | null
          severidad?: Database["public"]["Enums"]["nivel_severidad"]
          tipo_falla?: Database["public"]["Enums"]["tipo_falla"]
          url_evidencia_imagen?: string | null
          url_evidencia_video?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fallas_deteccion_recorrido_id_fkey"
            columns: ["recorrido_id"]
            isOneToOne: false
            referencedRelation: "recorridos"
            referencedColumns: ["id"]
          },
        ]
      }
      logros: {
        Row: {
          codigo: string
          id: string
          otorgado_at: string
          usuario_id: string
        }
        Insert: {
          codigo: string
          id?: string
          otorgado_at?: string
          usuario_id: string
        }
        Update: {
          codigo?: string
          id?: string
          otorgado_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          acepto_terminos_at: string | null
          created_at: string
          id: string
          municipio_id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Insert: {
          acepto_terminos_at?: string | null
          created_at?: string
          id: string
          municipio_id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Update: {
          acepto_terminos_at?: string | null
          created_at?: string
          id?: string
          municipio_id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Relationships: []
      }
      puntos_eventos: {
        Row: {
          created_at: string
          id: string
          motivo: string
          municipio: string
          puntos: number
          recorrido_id: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          motivo: string
          municipio: string
          puntos: number
          recorrido_id?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string
          municipio?: string
          puntos?: number
          recorrido_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "puntos_eventos_recorrido_id_fkey"
            columns: ["recorrido_id"]
            isOneToOne: false
            referencedRelation: "recorridos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "puntos_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recorridos: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["recorrido_estado"]
          fin: string
          id: string
          inicio: string
          km: number
          municipio: string
          procesado_at: string | null
          puntos_gps: number
          track: Json
          usuario_id: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["recorrido_estado"]
          fin: string
          id?: string
          inicio: string
          km?: number
          municipio: string
          procesado_at?: string | null
          puntos_gps?: number
          track?: Json
          usuario_id: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["recorrido_estado"]
          fin?: string
          id?: string
          inicio?: string
          km?: number
          municipio?: string
          procesado_at?: string | null
          puntos_gps?: number
          track?: Json
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recorridos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tramos: {
        Row: {
          geometria: Json
          id: string
          km: number
          localidad: string
          municipio: string
          nombre_codigo: string
        }
        Insert: {
          geometria: Json
          id: string
          km: number
          localidad: string
          municipio: string
          nombre_codigo: string
        }
        Update: {
          geometria?: Json
          id?: string
          km?: number
          localidad?: string
          municipio?: string
          nombre_codigo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cobertura_municipio: {
        Args: { p_municipio: string }
        Returns: {
          cubiertos: number
          km: number
          km_cubiertos: number
          localidad: string
          tramos: number
        }[]
      }
      municipio_actual: { Args: never; Returns: string }
      ranking_municipio: {
        Args: { p_municipio: string }
        Returns: {
          nombre: string
          posicion: number
          puntos: number
          usuario_id: string
        }[]
      }
      rol_actual: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
    }
    Enums: {
      estado_camino: "bueno" | "regular" | "malo" | "intransitable"
      nivel_severidad: "baja" | "media" | "alta"
      origen_datos: "app_sensor" | "camara_dashcam" | "formulario"
      recorrido_estado: "finalizado" | "descartado"
      rol_usuario: "productor" | "municipio" | "auditor"
      tipo_falla:
        | "bache"
        | "carcava"
        | "acumulacion_agua"
        | "falta_alcantarilla"
        | "maleza_alta"
        | "alcantarilla_rota"
        | "senalizacion"
        | "otro"
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
      recorrido_estado: ["finalizado", "descartado"],
      rol_usuario: ["productor", "municipio", "auditor"],
      tipo_falla: [
        "bache",
        "carcava",
        "acumulacion_agua",
        "falta_alcantarilla",
        "maleza_alta",
        "alcantarilla_rota",
        "senalizacion",
        "otro",
      ],
    },
  },
} as const
