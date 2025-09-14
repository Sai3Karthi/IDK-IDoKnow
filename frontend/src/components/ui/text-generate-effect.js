import React, { useEffect } from "react";
import { motion, stagger, useAnimate } from "framer-motion";
import { cn } from "../../lib/utils";

export function TextGenerateEffect({ words, className, filter = true, duration = 0.5 }) {
  const [scope, animate] = useAnimate();
  const wordsArray = String(words || "").split(" ").filter(Boolean);

  useEffect(() => {
    if (!scope.current) return;
    animate(
      "span",
      {
        opacity: 1,
        filter: filter ? "blur(0px)" : "none",
      },
      {
        duration: duration || 1,
        delay: stagger(0.2),
      }
    );
  }, [scope, animate, filter, duration]);

  return (
    <div className={cn("font-bold", className)}>
      <div className="mt-2">
        <motion.div ref={scope} className="text-2xl leading-snug tracking-wide">
          {wordsArray.map((word, idx) => (
            <motion.span
              key={word + idx}
              className="dark:text-white text-foreground opacity-0"
              style={{ filter: filter ? "blur(10px)" : "none" }}
            >
              {word}{idx < wordsArray.length - 1 ? " " : ""}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

export default TextGenerateEffect;
