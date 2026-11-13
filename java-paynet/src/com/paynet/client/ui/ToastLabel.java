package com.paynet.client.ui;

import javax.swing.*;
import java.awt.*;

/** Non-modal feedback with a short fade in and out; timer runs only while needed. */
public final class ToastLabel extends JLabel {
    private float alpha=1;
    private long start;
    private final Timer animation;
    public ToastLabel(){super("Ready");setFont(Theme.font(13,false));setForeground(Theme.MUTED);
        animation=new Timer(16,e->{long elapsed=(System.nanoTime()-start)/1_000_000;alpha=elapsed<180?Math.min(1,elapsed/180f):elapsed<5700?1:Math.max(0,(6200-elapsed)/500f);repaint();if(elapsed>=6200)((Timer)e.getSource()).stop();});}
    public void showMessage(String text,boolean error){setText(text);setToolTipText(text);setForeground(error?Theme.ERROR:Theme.BRAND);start=System.nanoTime();alpha=1;if(!Boolean.getBoolean("paynet.reducedMotion"))animation.restart();}
    @Override protected void paintComponent(Graphics g){Graphics2D p=(Graphics2D)g.create();p.setComposite(AlphaComposite.SrcOver.derive(alpha));super.paintComponent(p);p.dispose();}
    @Override public void removeNotify(){animation.stop();super.removeNotify();}
}
