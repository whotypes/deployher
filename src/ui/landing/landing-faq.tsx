import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion"

export const LandingFaq = () => {
  const { t } = useTranslation()

  const items = [
    { id: "faq-1", q: t("landing.faq.q1"), a: t("landing.faq.a1") },
    { id: "faq-2", q: t("landing.faq.q2"), a: t("landing.faq.a2") },
    { id: "faq-3", q: t("landing.faq.q3"), a: t("landing.faq.a3") },
    { id: "faq-4", q: t("landing.faq.q4"), a: t("landing.faq.a4") },
    { id: "faq-5", q: t("landing.faq.q5"), a: t("landing.faq.a5") },
    { id: "faq-6", q: t("landing.faq.q6"), a: t("landing.faq.a6") },
    { id: "faq-7", q: t("landing.faq.q7"), a: t("landing.faq.a7") },
    { id: "faq-8", q: t("landing.faq.q8"), a: t("landing.faq.a8") },
    { id: "faq-9", q: t("landing.faq.q9"), a: t("landing.faq.a9") }
  ]

  return (
    <section id="landing-faq" className="scroll-mt-28 py-28 md:py-40" aria-labelledby="landing-faq-heading">
      <div className="mx-auto max-w-[min(88rem,calc(100vw-2rem))] px-5 md:px-10">
        <div className="grid gap-14 md:grid-cols-5 md:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-2"
          >
            <h2
              id="landing-faq-heading"
              className="text-foreground font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-4xl md:text-5xl lg:text-6xl"
            >
              {t("landing.faq.title")}
            </h2>
            <p className="text-muted-foreground mt-6 text-xl sm:text-2xl md:text-3xl">{t("landing.faq.lead")}</p>
            <p className="text-muted-foreground mt-10 hidden text-base md:block">
              {t("landing.faq.more")}{" "}
              <Link to="/why" className="text-primary font-medium underline-offset-4 hover:underline">
                {t("landing.faq.moreLink")}
              </Link>
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-3"
          >
            <Accordion type="single" collapsible className="w-full">
              {items.map((item) => (
                <AccordionItem key={item.id} value={item.id} className="border-border/70">
                  <AccordionTrigger className="hover:text-foreground text-left text-lg font-medium hover:no-underline sm:text-xl md:text-2xl">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-lg leading-relaxed md:text-xl">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
