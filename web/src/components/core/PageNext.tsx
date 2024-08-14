/*
 * Copyright (c) [2023-2024] SUSE LLC
 *
 * All Rights Reserved.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of version 2 of the GNU General Public License as published
 * by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, contact SUSE LLC.
 *
 * To contact SUSE LLC about this file by physical or electronic mail, you may
 * find current contact information at www.suse.com.
 */

import React from "react";
import {
  Card,
  CardProps,
  CardBody,
  CardBodyProps,
  CardHeader,
  CardHeaderProps,
  PageGroup,
  PageGroupProps,
  PageSection,
  Stack,
  PageSectionProps,
  Split,
} from "@patternfly/react-core";
import { Flex } from "~/components/layout";
import { _ } from "~/i18n";
import textStyles from "@patternfly/react-styles/css/utilities/Text/text";

type SectionProps = {
  title?: string;
  value?: string;
  description?: string;
  descriptionProps?: CardBodyProps;
  headerLevel?: "h1" | "h2" | "h3" | "h4"; // FIXME: reuse a headerLevel type
  pfCardProps?: CardProps;
  pfCardHeaderProps?: CardHeaderProps;
  pfCardBodyProps?: CardBodyProps;
};

const defaultCardProps: CardProps = { isRounded: true, isCompact: true };

const Header = ({ hasGutter = true, children, ...props }) => {
  return (
    <PageSection variant="light" stickyOnBreakpoint={{ default: "top" }} {...props}>
      <Stack hasGutter={hasGutter}>{children}</Stack>
    </PageSection>
  );
};

/**
 * Creates a page region on top of PF/Card component
 *
 * @example <caption>Simple usage</caption>
 *   <Page.Section>
 *     <UserSectionContent />
 *   </Page.Section>
 */
const Section = ({
  title,
  value,
  headerLevel: Title = "h3",
  pfCardProps,
  pfCardHeaderProps,
  pfCardBodyProps,
  children,
}: React.PropsWithChildren<SectionProps>) => {
  const renderTitle = title?.trim() !== "";
  const renderValue = value?.trim() !== "";
  const renderHeader = renderTitle || renderValue;

  console.log("here");

  return (
    <Card {...defaultCardProps} {...pfCardProps}>
      {renderHeader && (
        <CardHeader {...pfCardHeaderProps}>
          <Flex columnGap="columnGapSm" rowGap="rowGapXs">
            {renderTitle && <Title>{title}</Title>}
            {renderValue && (
              <Flex.Item grow="grow" className={textStyles.fontSizeXl}>
                {value}
              </Flex.Item>
            )}
          </Flex>
        </CardHeader>
      )}
      <CardBody {...pfCardBodyProps}>{children}</CardBody>
    </Card>
  );
};

/**
 * Wraps given children in an PageGroup sticky at the bottom
 *
 * @example <caption>Simple usage</caption>
 *   <Page>
 *     <UserSectionContent />
 *   </Page>
 */
const Actions = ({ children }: React.PropsWithChildren) => {
  return (
    <PageGroup hasShadowTop stickyOnBreakpoint={{ default: "bottom" }}>
      <PageSection>{children}</PageSection>
    </PageGroup>
  );
};

const Content = ({ children, ...pageSectionProps }: React.PropsWithChildren<PageSectionProps>) => (
  <PageSection isFilled {...pageSectionProps}>
    {children}
  </PageSection>
);

/**
 * Wraps in a PF/PageGroup the content given by a router Outlet
 *
 * @example <caption>Simple usage</caption>
 *   <Page>
 *     <UserSectionContent />
 *   </Page>
 */
const Page = ({
  children,
  ...pageGroupProps
}: React.PropsWithChildren<PageGroupProps>): React.ReactNode => {
  return <PageGroup {...pageGroupProps}>{children}</PageGroup>;
};

Page.displayName = "agama/core/Page";
Page.Header = Header;
Page.Content = Content;
Page.Actions = Actions;
Page.Section = Section;
export default Page;
