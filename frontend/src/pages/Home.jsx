import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe2,
  Wallet,
  ArrowDownLeft,
  Check,
  Smartphone,
  Users,
  LockKeyhole,
} from "lucide-react";
export default function Home() {
  return (
    <>
      <section className="hero">
        <img
          className="hero-photo"
          src="/images/hero.jpg"
          alt="A person holding a smartphone while using its touchscreen"
          fetchPriority="high"
        />
        <div className="hero-overlay" />
        <div className="container hero-inner">
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
            className="hero-copy"
          >
            <span className="hero-label">
              <span className="status-dot" /> YOUR MONEY. YOUR WORLD. CONNECTED.
            </span>
            <h1>
              Payments Made
              <br />
              Simple. Connections
              <br />
              Made <em>Instant.</em>
            </h1>
            <p>
              A simpler way to send, receive, and stay on top of your money.
              Meet PayNet — your everyday connections, brought closer.
            </p>
            <div className="hero-buttons">
              <Link className="button" to="/register">
                Get started <ArrowUpRight size={19} />
              </Link>
              <a className="button glass" href="#features">
                Explore features <ArrowRight size={18} />
              </a>
            </div>
            <div className="hero-assurance">
              <span>
                <ShieldCheck size={17} /> Built with security in mind
              </span>
              <span>
                <Zap size={17} /> Designed for real-time connections
              </span>
            </div>
          </motion.div>
          <motion.div
            className="hero-wallet"
            initial={{ opacity: 0, y: 35, rotate: 3 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="wallet-top">
              <span>
                <Wallet size={19} /> PayNet wallet
              </span>
              <span className="mini-pill">DEMO PREVIEW</span>
            </div>
            <small>Your available balance</small>
            <h2>
              LKR 125,750<span>.00</span>
            </h2>
            <div className="wallet-number">
              •••• &nbsp; •••• &nbsp; 4821 <span>LKR</span>
            </div>
            <div className="wallet-received">
              <span className="transaction-icon incoming">
                <ArrowDownLeft />
              </span>
              <div>
                <strong>Payment received</strong>
                <small>Sarah Wilson · Sample transaction</small>
              </div>
              <b>+8,500.00</b>
              <Check size={16} />
            </div>
            <div className="wallet-caption">
              <span className="status-dot" /> A glimpse of your connected wallet
            </div>
          </motion.div>
        </div>
        <div className="hero-bottom container">
          <span>MADE FOR THE WAY YOU LIVE</span>
          <span>
            Simple transfers <i /> Clear insights <i /> More possibilities
          </span>
          <a href="#features" aria-label="Scroll to features">
            &#8595;
          </a>
        </div>
      </section>
      <section className="trust-strip">
        <div className="container">
          <span>One wallet. A world of possibilities.</span>
          <span>
            <Smartphone /> Everyday payments
          </span>
          <span>
            <Users /> Meaningful connections
          </span>
          <span>
            <ShieldCheck /> Thoughtful design
          </span>
        </div>
      </section>
      <section className="section container" id="features">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LESS FRICTION. MORE FREEDOM.</span>
            <h2>
              Good things happen
              <br />
              when money moves simply.
            </h2>
          </div>
          <p>
            All the essentials in one beautifully simple place.
            <br />
            Spend less time managing, more time living.
          </p>
        </div>
        <div className="feature-grid">
          {[
            [
              Zap,
              "Send in a few taps",
              "An email address. An amount. A connection. Preview a simpler way to send virtual money.",
              "/send-money",
              "/images/feature-digital-payments.jpg",
              "A person tapping a smartphone on a payment terminal for a contactless payment",
            ],
            [
              Wallet,
              "Your money, in focus",
              "A clear view of your wallet, activity and transactions. Every detail, thoughtfully organized.",
              "/dashboard",
              "/images/feature-secure-transactions.jpg",
              "Illuminated computer circuitry representing secure digital banking infrastructure",
            ],
            [
              Globe2,
              "Stay in the loop",
              "Explore payment notifications and a connected workspace, built for future real-time updates.",
              "/notifications",
              "/images/feature-instant-transfers.svg",
              "Two connected mobile wallets with transfer arrows and a lightning bolt representing instant money transfers",
            ],
          ].map(([Icon, title, copy, to, image, imageAlt], i) => (
            <motion.article
              className="feature-card"
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="feature-image">
                <img
                  src={image}
                  alt={imageAlt}
                  width="1200"
                  height="750"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <span className="feature-icon">
                <Icon />
              </span>
              <span className="feature-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
              <Link to={to}>
                Take a look <ArrowUpRight size={18} />
              </Link>
            </motion.article>
          ))}
        </div>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="container how-grid">
          <div className="lifestyle-photo">
            <img
              src="/images/lifestyle.jpg"
              alt="Colleagues working together around a laptop"
              loading="lazy"
            />
            <div className="photo-note">
              <ShieldCheck />
              <div>
                <strong>Made for your everyday.</strong>
                <span>From shared plans to new possibilities.</span>
              </div>
            </div>
          </div>
          <div>
            <span className="eyebrow">A FEW TAPS. A FRESH START.</span>
            <h2>
              Life moves fast.
              <br />
              Your money should too.
            </h2>
            <p className="muted">Get to know PayNet in three simple steps.</p>
            {[
              [
                "Make yourself at home",
                "Create your profile and discover your personal wallet.",
              ],
              [
                "Connect with someone",
                "Use a registered email to prepare a virtual transfer.",
              ],
              [
                "Keep the bigger picture",
                "Follow your activity in one clear, connected dashboard.",
              ],
            ].map(([title, copy], i) => (
              <div className="step" key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </div>
            ))}
            <Link to="/dashboard" className="text-button">
              Explore the demo <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section className="section container security" id="about">
        <div>
          <span className="eyebrow">CONFIDENCE, BY DESIGN</span>
          <h2>
            A thoughtful foundation.
            <br />
            For what comes next.
          </h2>
          <p>
            PayNet explores the network behind digital payments: a React
            experience, a Node.js service, and a foundation for future secure,
            real-time communication.
          </p>
          <div className="security-points">
            <span>
              <LockKeyhole /> JWT authentication planned
            </span>
            <span>
              <Zap /> Socket.IO updates planned
            </span>
            <span>
              <ShieldCheck /> Server-side authorization required
            </span>
          </div>
          <p className="fine-print">
            A university learning project. Authentication, payment processing
            and real-time events are not yet connected.
          </p>
        </div>
        <div className="network-visual">
          <div className="network-orbit">
            <span className="network-core">
              <Wallet size={42} />
            </span>
            <span className="network-node node-one">
              <Smartphone />
            </span>
            <span className="network-node node-two">
              <Users />
            </span>
            <span className="network-node node-three">
              <ShieldCheck />
            </span>
          </div>
          <strong>Built around connection.</strong>
          <p>People. Payments. Possibilities.</p>
        </div>
      </section>
      <section className="demo-stats">
        <div className="container">
          <span className="eyebrow">
            A SNAPSHOT OF THE DEMO · ILLUSTRATIVE FIGURES
          </span>
          <div>
            {[
              ["1,248", "Sample users"],
              ["8,562", "Sample transactions"],
              ["LKR 2.4M", "Illustrative transfer volume"],
              ["11", "Pages to explore"],
            ].map(([v, l]) => (
              <div key={l}>
                <strong>{v}</strong>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="container cta">
        <div>
          <span className="eyebrow">YOUR NEXT CONNECTION STARTS HERE</span>
          <h2>
            A little simpler.
            <br />A lot more connected.
          </h2>
          <p>Take a look around your new PayNet workspace.</p>
        </div>
        <Link className="button white" to="/dashboard">
          Explore demo dashboard <ArrowUpRight size={20} />
        </Link>
      </section>
    </>
  );
}

