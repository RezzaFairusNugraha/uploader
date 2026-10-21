import { toast } from "sonner";

export interface NotifyOptions {
  description?: string;
  duration?: number;
}

export const notify = {
  success(title: string, options?: NotifyOptions) {
    return toast.success(title, {
      description: options?.description,
      duration: options?.duration ?? 3500,
    });
  },

  info(title: string, options?: NotifyOptions) {
    return toast.info(title, {
      description: options?.description,
      duration: options?.duration ?? 3500,
    });
  },

  warning(title: string, options?: NotifyOptions) {
    return toast.warning(title, {
      description: options?.description,
      duration: options?.duration ?? 5000,
    });
  },

  error(title: string, options?: NotifyOptions) {
    return toast.error(title, {
      description: options?.description,
      duration: options?.duration ?? 6000,
    });
  },

  promise<T>(
    promise: Promise<T> | (() => Promise<T>),
    data: {
      loading: string;
      success: string | ((result: T) => { title: string; description?: string } | string);
      error: string | ((err: unknown) => { title: string; description?: string } | string);
    }
  ) {
    return toast.promise(promise, {
      loading: data.loading,
      success: (res: T) => {
        const out = typeof data.success === "function" ? data.success(res) : data.success;
        if (typeof out === "string") {
          return { message: out, duration: 3500 };
        }
        return {
          message: out.title,
          description: out.description,
          duration: 3500,
        };
      },
      error: (err: unknown) => {
        const out = typeof data.error === "function" ? data.error(err) : data.error;
        if (typeof out === "string") {
          return { message: out, duration: 6000 };
        }
        return {
          message: out.title,
          description: out.description,
          duration: 6000,
        };
      },
    });
  },
};
